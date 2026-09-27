import io
import os
import modal
from fastapi import UploadFile, File, Response, Request, HTTPException, status

from backend.app import app

@app.cls(gpu="t4", scaledown_window=30, secrets=[modal.Secret.from_name("huggingface-secret"), modal.Secret.from_name("api-auth-secret")])
class AutoRemover:
    @modal.enter()
    def enter(self):
        import torch
        from transformers import AutoModelForImageSegmentation

        # Load the model into GPU memory once per container lifecycle
        print("Loading RMBG-2.0 model to GPU...")
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = AutoModelForImageSegmentation.from_pretrained("briaai/RMBG-2.0", trust_remote_code=True)
        self.model.to(self.device)
        self.model.eval()
        print("Model loaded successfully.")

    @modal.fastapi_endpoint(method="POST", docs=True)
    async def process(self, request: Request, image: UploadFile = File(...)):
        # Security Check
        auth_header = request.headers.get("Authorization")
        expected_key = os.environ.get("API_KEY")
        if not expected_key or auth_header != f"Bearer {expected_key}":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized: Invalid or missing API Key")

        from PIL import Image
        import torch
        from torchvision import transforms
        import torchvision.transforms.functional as TF

        # 1. Read and parse the uploaded image
        img_bytes = await image.read()
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        
        # 2. Preprocess for RMBG-2.0 (expects 1024x1024)
        input_size = (1024, 1024)
        transform = transforms.Compose([
            transforms.Resize(input_size),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ])

        # Move to GPU and add batch dimension
        input_tensor = transform(img).unsqueeze(0).to(self.device)

        # 3. Perform Inference
        with torch.no_grad():
            preds = self.model(input_tensor)[-1].sigmoid()

        # 4. Post-process mask
        # Resize mask back to the original image dimensions [height, width]
        mask = TF.resize(preds, [img.height, img.width])
        mask = mask.squeeze().cpu().numpy()

        # Apply mask to image
        mask_img = Image.fromarray((mask * 255).astype("uint8"), mode="L")
        img.putalpha(mask_img)

        # 5. Return as PNG
        out_io = io.BytesIO()
        img.save(out_io, format="PNG")
        
        return Response(content=out_io.getvalue(), media_type="image/png")
