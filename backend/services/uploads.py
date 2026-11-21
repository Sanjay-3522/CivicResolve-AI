"""
CivicResolve — hardened image upload handling.
"""

import io
import os
import uuid

from fastapi import HTTPException, UploadFile
from PIL import Image

from constants import ALLOWED_IMAGE_FORMATS, MAX_UPLOAD_BYTES

MAX_IMAGE_PIXELS = 24_000_000  # Bound decoded memory usage even for tiny compressed files.

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


async def save_upload(file: UploadFile, prefix: str) -> str:
    """
    Hardened upload handler:
    1. Enforces strict server-side size limit (<8MB) before saving to disk.
    2. Validates real image contents using PIL Image.verify() (rejects .html, .svg, executables).
    3. Derives file extension strictly from verified image format, not client-supplied filename.
    """
    # Read up to MAX_UPLOAD_BYTES + 1 to enforce size check
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=400, detail=f"File exceeds maximum allowed size of {MAX_UPLOAD_BYTES // (1024 * 1024)}MB."
        )
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file upload.")

    # Validate image content
    try:
        # Only the allowlisted decoders are ever tried, so Pillow's PSD/TIFF/PDF/BMP/GIF
        # parsers (and their CVEs) are unreachable from user uploads.
        with Image.open(io.BytesIO(content), formats=list(ALLOWED_IMAGE_FORMATS)) as img:
            if img.width * img.height > MAX_IMAGE_PIXELS:
                raise ValueError("Image pixel dimensions exceed safe bounds")
            img.verify()
            image_format = img.format  # e.g., 'JPEG', 'PNG', 'WEBP'
        # Image.verify() only verifies metadata. Actually decode once to reject
        # truncated data and compressed decompression bombs before storing it.
        with Image.open(io.BytesIO(content), formats=list(ALLOWED_IMAGE_FORMATS)) as decoded:
            decoded.load()
    except Exception:
        raise HTTPException(
            status_code=400, detail="Invalid image content. The uploaded file is corrupted or not a valid image format."
        ) from None

    if image_format not in ALLOWED_IMAGE_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image format: {image_format}. Only JPEG, PNG, and WebP images are permitted.",
        )

    # Derive extension strictly from verified format
    ext = ALLOWED_IMAGE_FORMATS[image_format]
    filename = f"{prefix}_{uuid.uuid4().hex[:8]}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)

    with open(path, "wb") as f:
        f.write(content)
    return path
