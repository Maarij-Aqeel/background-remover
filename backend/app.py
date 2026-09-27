import modal

def download_rmbg_weights():
    from transformers import AutoModelForImageSegmentation
    print("Downloading RMBG-2.0 weights...")
    AutoModelForImageSegmentation.from_pretrained("briaai/RMBG-2.0", trust_remote_code=True)

def download_sam_weights():
    from sam2.sam2_image_predictor import SAM2ImagePredictor
    print("Downloading SAM 2 tiny weights...")
    SAM2ImagePredictor.from_pretrained("facebook/sam2-hiera-tiny", device="cpu")

# Define the image with all dependencies
image = (
    modal.Image.debian_slim(python_version="3.10")
    .pip_install(
        "torch",
        "torchvision",
        "transformers",
        "pillow",
        "fastapi[standard]",
        "python-multipart",
        "sam2",
        "kornia",
        "timm"
    )
    .run_function(download_rmbg_weights, secrets=[modal.Secret.from_name("huggingface-secret")])
    .run_function(download_sam_weights)
)

# Initialize the Modal App
app = modal.App("bg-remover", image=image)
