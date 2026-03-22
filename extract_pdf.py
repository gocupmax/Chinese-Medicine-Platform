#!/usr/bin/env python3
"""Extract text from PDF using PyMuPDF + OCR fallback via Tesseract."""
import sys
import json
import fitz  # PyMuPDF

# Medical terms to check if text is readable Chinese
MEDICAL_TERMS = ['骨折', '脫位', '治療', '骨傷', '損傷', '關節', '筋', '疼痛', '固定', '復位', '中醫', '手法', '患者', '藥', '病', '脈', '血', '氣', '症狀', '診斷']

def is_readable(text):
    """Check if extracted text contains enough readable Chinese medical terms."""
    found = sum(1 for t in MEDICAL_TERMS if t in text)
    return found >= 3

def extract_with_pymupdf(filepath):
    """Try to extract text directly from PDF."""
    doc = fitz.open(filepath)
    total_text = ""
    for page in doc:
        total_text += page.get_text()
    doc.close()
    return total_text

def extract_with_ocr(filepath):
    """Fall back to OCR for PDFs with embedded/image-based fonts."""
    try:
        import pytesseract
        from PIL import Image
        import io
        
        doc = fitz.open(filepath)
        total_text = ""
        # Process up to 10 pages for OCR (to avoid timeout)
        max_pages = min(len(doc), 10)
        
        for i in range(max_pages):
            page = doc[i]
            # Render page to image at 200 DPI for good OCR quality
            mat = fitz.Matrix(2, 2)  # 2x zoom = ~144 DPI
            pix = page.get_pixmap(matrix=mat)
            img_data = pix.tobytes("png")
            img = Image.open(io.BytesIO(img_data))
            
            # OCR with Chinese Traditional + Simplified + English
            text = pytesseract.image_to_string(img, lang='chi_tra+chi_sim+eng')
            total_text += text + "\n"
        
        doc.close()
        return total_text
    except Exception as e:
        return f"OCR_ERROR: {e}"

def extract(filepath):
    try:
        # Step 1: Try direct text extraction
        text = extract_with_pymupdf(filepath)
        
        if text.strip() and is_readable(text):
            return json.dumps({
                "text": text[:100000],
                "pages": len(fitz.open(filepath)),
                "totalChars": len(text),
                "method": "pymupdf",
            })
        
        # Step 2: Fall back to OCR
        print(f"Direct extraction not readable, trying OCR...", file=sys.stderr)
        ocr_text = extract_with_ocr(filepath)
        
        if ocr_text and not ocr_text.startswith("OCR_ERROR") and is_readable(ocr_text):
            return json.dumps({
                "text": ocr_text[:100000],
                "pages": len(fitz.open(filepath)),
                "totalChars": len(ocr_text),
                "method": "ocr",
            })
        
        # Step 3: Return whatever we have (even if not ideal)
        best = text if len(text) > len(ocr_text or "") else (ocr_text or text)
        return json.dumps({
            "text": best[:100000] if best else "",
            "pages": len(fitz.open(filepath)),
            "totalChars": len(best) if best else 0,
            "method": "fallback",
            "warning": "text_may_be_garbled",
        })
        
    except Exception as e:
        return json.dumps({"text": "", "pages": 0, "error": str(e)})

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"text": "", "pages": 0, "error": "no_filepath"}))
        sys.exit(1)
    print(extract(sys.argv[1]))
