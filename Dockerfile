FROM node:20-slim

# Install Python, Tesseract OCR with Chinese language packs
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    tesseract-ocr tesseract-ocr-chi-tra tesseract-ocr-chi-sim \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip3 install --break-system-packages pymupdf pytesseract Pillow

WORKDIR /app

# Copy package files and install Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source and build
COPY . .
RUN npm run build

# Create upload directory
RUN mkdir -p uploads

# Expose port
EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

CMD ["node", "dist/index.cjs"]
