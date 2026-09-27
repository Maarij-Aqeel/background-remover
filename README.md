# BG Remover

A serverless background removal pipeline using open-source models:
- **BRIA RMBG 2.0** for automatic background removal.
- **Meta SAM 2 (Tiny)** for interactive subject/object-based segmentation.

## Project Structure
- `/backend`: Modal.com serverless functions
- `/frontend`: React + Vite UI (Tailwind CSS v4)

## How to Deploy & Run

### 1. Deploy the Backend (Modal)
You need a Modal account (free tier works great).
```bash
# 1. Install Modal CLI
pip install modal

# 2. Authenticate
modal setup

# 3. Secure your API! Create a secret API key to protect your GPU endpoints
modal secret create api-auth-secret API_KEY="your-super-secret-key-123"

# 4. Deploy both endpoints
modal deploy backend/main.py
```
After running this, Modal will output two URLs (one for `autoremover-process` and one for `samsegmenter-process`).

### 2. Configure the Frontend
In the `/frontend` directory, create a `.env.local` file and add the URLs you got from Modal along with your secure API key:
```
VITE_API_AUTO_REMOVE=https://your-username--bg-remover-autoremover-process.modal.run
VITE_API_SEGMENT=https://your-username--bg-remover-samsegmenter-process.modal.run
VITE_API_KEY=your-super-secret-key-123
```

### 3. Run the Frontend locally
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173` to start removing backgrounds!
