FROM node:20-slim

# Install Python, Tesseract OCR with Chinese language packs
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv \
    tesseract-ocr tesseract-ocr-chi-tra tesseract-ocr-chi-sim \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip3 install --break-system-packages pymupdf pytesseract Pillow

WORKDIR /app

# Copy package files and install ALL dependencies (need devDeps for build)
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Create directories
RUN mkdir -p uploads

EXPOSE 5000

ENV NODE_ENV=production
ENV PORT=5000

# Use start script that initializes DB then starts server
RUN chmod +x start.sh
CMD ["sh", "start.sh"]
