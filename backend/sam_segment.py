import io
import json
import modal
import numpy as np
from fastapi import UploadFile, File, Form, Response

from backend.app import app

@app.cls(gpu="t4", scaledown_window=60)
class SAMSegmenter:
    @modal.enter()
    def enter(self):
        import torch
        from sam2.sam2_image_predictor import SAM2ImagePredictor

        print("Loading SAM 2 model to GPU...")
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        
        # Load the predictor
        self.predictor = SAM2ImagePredictor.from_pretrained("facebook/sam2-hiera-tiny", device=self.device)
        print("SAM 2 loaded successfully.")

    @modal.fastapi_endpoint(method="POST", docs=True)
    async def process(self, image: UploadFile = File(...), points: str = Form(...)):
        from PIL import Image

        # 1. Read and parse the uploaded image
        img_bytes = await image.read()
        pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        img_np = np.array(pil_img)
        
        # 2. Parse the points
        # Expected format: JSON string of list of dicts: [{"x": 10, "y": 20, "label": 1}, ...]
        points_data = json.loads(points)
        input_point = []
        input_label = []
        for p in points_data:
            input_point.append([p["x"], p["y"]])
            input_label.append(p["label"])
            
        input_point = np.array(input_point)
        input_label = np.array(input_label)

        # 3. Predict using SAM 2
        # Set the image (Phase 1)
        self.predictor.set_image(img_np)
        
        # Predict based on points (Phase 2)
        masks, scores, logits = self.predictor.predict(
            point_coords=input_point,
            point_labels=input_label,
            multimask_output=False, # We usually just want the best mask
        )

        # The output mask is a boolean array of shape (1, H, W)
        mask = masks[0]
        
        # 4. Post-process to create transparent PNG
        # Apply mask to image
        mask_img = Image.fromarray((mask * 255).astype("uint8"), mode="L")
        pil_img.putalpha(mask_img)

        # 5. Return as PNG
        out_io = io.BytesIO()
        pil_img.save(out_io, format="PNG")
        
        return Response(content=out_io.getvalue(), media_type="image/png")
