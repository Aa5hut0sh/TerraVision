import { createJob, pollJob } from './lib/api';
import { buildDataset } from './lib/dataset';
import { useAppStore } from './store';

let currentRunId = 0;

export async function runPipeline(target: File | string): Promise<void> {
  const runId = ++currentRunId;
  const store = useAppStore.getState();

  // Reset viewer state
  store.resetViewer();
  store.setDataset(null);
  store.setScreen('processing');

  try {
    store.showNotice('Initiating pipeline...', 'info');

    const initialStages = (typeof target === 'string' && target.toLowerCase().includes('tif')) ||
      (typeof target !== 'string' && (target.name.toLowerCase().endsWith('.tif') || target.name.toLowerCase().endsWith('.tiff') || target.name.toLowerCase().endsWith('.geotiff')))
      ? [
          'Ingesting GeoTIFF & CRS',
          'Depth Anything V2 inference',
          'Fetching SRTM 30m terrain',
          'Calibration & absolute DSM synthesis',
          'Surface normal & relief calculation',
          'Packaging 3D assets'
        ]
      : [
          'Ingesting imagery',
          'Depth Anything V2 inference',
          'Height AGL conversion (metres)',
          'Surface normal & relief calculation',
          'Packaging 3D assets'
        ];

    store.setActiveJob({
      jobId: 'initializing',
      stages: initialStages,
      stageIndex: 0,
      status: 'running',
      error: null,
    });

    // 1. Submit Job
    const jobId = await createJob(target);
    if (runId !== currentRunId) return;

    store.setActiveJob({
      jobId,
      stages: initialStages,
      stageIndex: 0,
      status: 'running',
      error: null,
    });

    // 2. Poll progress
    const finalJob = await pollJob(jobId, update => {
      if (runId !== currentRunId) return;
      store.setActiveJob({
        jobId: update.job_id,
        stages: update.stages,
        stageIndex: update.stage_index,
        status: update.status,
        error: update.error,
      });
    });

    if (runId !== currentRunId) return;

    if (!finalJob.result) {
      throw new Error('Pipeline finished without result payload');
    }

    // 3. Download and parse package assets
    const dataset = await buildDataset(finalJob.result);
    if (runId !== currentRunId) return;

    store.setDataset(dataset);
    store.showNotice('3D assets ready for fly-through!', 'success');
  } catch (err: any) {
    if (runId !== currentRunId) return;
    const msg = err?.message || 'Pipeline execution failed';
    store.updateJobProgress(0, 'error', msg);
    store.showNotice(msg, 'error');
  }
}

export function cancelCurrentRun() {
  currentRunId++;
}
