# TerraVision — AWS EC2 Deployment (Docker + Nginx + Let's Encrypt SSL)

**Domain:** `https://terravision.ashuttosh.me/`  
**Architecture:** Docker Compose with isolated `backend` (FastAPI + PyTorch), `frontend` (React + Three.js), `nginx` (Edge Reverse Proxy & SSL), and `certbot` (Auto-Renewing TLS).

---

## 1. Prerequisites on AWS

### A. Recommended EC2 Instance
- **Instance Type:** `t3.large` or `c6i.large` (minimum 2 vCPU, 4GB–8GB RAM recommended for PyTorch inference).  
  *If using GPU:* `g4dn.xlarge` (with NVIDIA Container Toolkit).
- **OS:** Ubuntu 22.04 LTS or Ubuntu 24.04 LTS.
- **Storage:** 30 GB gp3 SSD.

### B. Security Group Inbound Rules
Ensure your EC2 Security Group allows the following ports:

| Type | Protocol | Port Range | Source | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **HTTP** | TCP | `80` | `0.0.0.0/0` | Let's Encrypt verification & redirect |
| **HTTPS** | TCP | `443` | `0.0.0.0/0` | Secure SSL Web Traffic |
| **SSH** | TCP | `22` | `Your IP` | Server Terminal Access |

### C. DNS Configuration (Cloudflare / Namecheap / Route 53)
Create an **A Record** pointing to your EC2 instance's Elastic IP / Public IPv4:

- **Type:** `A`
- **Name / Host:** `terravision` (or `terravision.ashuttosh.me`)
- **Value / Target:** `<Your EC2 Public IP>`
- **Proxy Status (if Cloudflare):** DNS Only (Grey Cloud) during initial certificate issuance, then can be Proxied.

---

## 2. Server Setup on EC2

SSH into your EC2 instance:
```bash
ssh -i your-key.pem ubuntu@<your-ec2-ip>
```

### A. Install Docker & Docker Compose
```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install -y ca-certificates curl gnupg lsb-release
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Allow running docker without sudo
sudo usermod -aG docker $USER
newgrp docker
```

---

## 3. Clone & Prepare Codebase on EC2

```bash
# Clone TerraVision repository on your EC2 instance
git clone <YOUR_GITHUB_REPO_URL> ~/GeoProject
cd ~/GeoProject

# Ensure your model checkpoint (best.pt) is placed into backend/model/
# Example via SCP from your local machine:
# scp -i your-key.pem backend/model/best.pt ubuntu@<your-ec2-ip>:~/GeoProject/backend/model/best.pt
```

Check that `best.pt` is present:
```bash
ls -lh backend/model/best.pt
```

---

## 4. Deploying Alongside Pravaah (Shared Nginx Gateway)

Since Pravaah already binds to Port 80 and 443, TerraVision runs its `backend` and `frontend` on the shared Docker bridge network (`pravaah_net`), and Pravaah's Nginx reverse-proxies requests for `terravision.ashuttosh.me` directly.

### Step A: Update Pravaah
In your Pravaah directory (`~/Pravaah`):
```bash
cd ~/Pravaah
git pull
sudo docker compose up -d nginx
```

### Step B: Issue SSL for TerraVision
From your Pravaah directory:
```bash
sudo ./dockerfiles/init-ssl.sh aashutoshsharma2905@gmail.com terravision.ashuttosh.me
```

### Step C: Launch TerraVision Services
From your GeoProject directory (`~/GeoProject`):
```bash
cd ~/GeoProject
sudo docker compose up -d --build
```

---

## 5. Managing & Verifying the Deployment

### Check running containers:
```bash
sudo docker ps
```
You should see:
- `terravision_backend` (Up)
- `terravision_frontend` (Up)
- `pravaah_nginx` (Ports 80 & 443 routing both domains)

### View live logs:
```bash
# Backend logs
sudo docker compose logs -f backend

# Frontend logs
sudo docker compose logs -f frontend
```

---

## 6. Verification

Visit in your browser:
👉 **`https://terravision.ashuttosh.me/`**

- You should see the valid padlock icon with Let's Encrypt SSL.
- Test the preloaded demo buttons:
  - **Sample: PNG (Relative DSM)**
  - **Sample: GeoTIFF (Absolute DSM)**
- Drag and drop your own aerial images or GeoTIFFs to run live 3D surface reconstruction!
