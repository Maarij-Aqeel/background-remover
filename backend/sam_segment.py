import io
import os
import json
import modal
import numpy as np
from fastapi import UploadFile, File, Form, Response, Request, HTTPException, status

from backend.app import app

@app.cls(gpu="t4", scaledown_window=30, secrets=[modal.Secret.from_name("api-auth-secret")])
class SAMSegmenter:
    @modal.enter()
    def enter(self):
        import torch
        from sam2.sam2_image_predictor import SAM2ImagePredictor
        from sam2.automatic_mask_generator import SAM2AutomaticMaskGenerator

        print("Loading SAM 2 model to GPU...")
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Load the predictor
        self.predictor = SAM2ImagePredictor.from_pretrained("facebook/sam2-hiera-tiny", device=self.device)
        self.mask_generator = SAM2AutomaticMaskGenerator(self.predictor.model)
        print("SAM 2 loaded successfully.")

    @modal.fastapi_endpoint(method="POST", docs=True)
    async def process(self, request: Request, image: UploadFile = File(...), points: str = Form(None)):
        # Security Check
        auth_header = request.headers.get("Authorization")
        expected_key = os.environ.get("API_KEY")
        if not expected_key or auth_header != f"Bearer {expected_key}":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized: Invalid or missing API Key")

        from PIL import Image
        import cv2

        # 1. Read and parse the uploaded image
        img_bytes = await image.read()
        pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        img_np = np.array(pil_img)
        
        # 2. Check which mode we are running
        if not points or points == "[]" or points == "":
            # --- AUTO MASK GENERATION MODE ---
            # Max dimension to avoid huge processing times
            max_size = 1024
            ratio = 1.0
            if pil_img.width > max_size or pil_img.height > max_size:
                ratio = max_size / max(pil_img.width, pil_img.height)
                new_size = (int(pil_img.width * ratio), int(pil_img.height * ratio))
                pil_img = pil_img.resize(new_size, Image.Resampling.LANCZOS)
                
            scaled_img_np = np.array(pil_img)
            
            # Generate all masks
            masks = self.mask_generator.generate(scaled_img_np)
            
            # We need to return lightweight polygons for the frontend to render hover states
            results = []
            for i, m in enumerate(masks):
                seg = (m["segmentation"] * 255).astype(np.uint8)
                contours, _ = cv2.findContours(seg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                
                polygons = []
                for cnt in contours:
                    epsilon = 0.005 * cv2.arcLength(cnt, True)
                    approx = cv2.approxPolyDP(cnt, epsilon, True)
                    if len(approx) >= 3:
                        poly = (approx.flatten() / ratio).tolist()
                        poly = [round(p, 1) for p in poly]
                        polygons.append(poly)
                
                if polygons:
                    bbox = [round(b / ratio, 1) for b in m["bbox"]]
                    results.append({
                        "id": i,
                        "area": m["area"] / (ratio * ratio),
                        "bbox": bbox,
                        "polygons": polygons
                    })
                    
            return {"masks": results}

        else:
            # --- POINT SEGMENTATION MODE ---
            points_data = json.loads(points)
            input_point = []
            input_label = []
            for p in points_data:
                input_point.append([p["x"], p["y"]])
                input_label.append(p["label"])
                
            input_point = np.array(input_point)
            input_label = np.array(input_label)

            self.predictor.set_image(img_np)
            
            masks, scores, logits = self.predictor.predict(
                point_coords=input_point,
                point_labels=input_label,
                multimask_output=False,
            )

            mask = masks[0]
            mask_img = Image.fromarray((mask * 255).astype("uint8"), mode="L")
            pil_img.putalpha(mask_img)

            out_io = io.BytesIO()
            pil_img.save(out_io, format="PNG")
            
            return Response(content=out_io.getvalue(), media_type="image/png")
