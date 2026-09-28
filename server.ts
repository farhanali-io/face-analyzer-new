import express from 'express';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '25mb' }));

// Helper to sanitize base64
function extractBase64Data(dataUrl: string): { mimeType: string; data: string } {
  const matches = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (matches && matches.length === 3) {
    return { mimeType: matches[1], data: matches[2] };
  }
  return { mimeType: 'image/jpeg', data: dataUrl.replace(/^data:image\/[a-z]+;base64,/, '') };
}

// Face analysis API endpoint
app.post('/api/analyze-face', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ isClearFace: false, error: 'No image data provided' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return res.status(503).json({
        isClearFace: false,
        error: 'Server-side AI is not configured. Biometric scanning runs client-side with @vladmandic/face-api.'
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const { mimeType, data } = extractBase64Data(image);

    const prompt = `You are a certified clinical facial aesthetics and biometric proportions expert.
First, check if the provided image is a clear, identifiable front-facing human portrait suitable for biometric analysis. If the image is blurry, too dark, obstructed, non-human, or unidentifiable, set "isClearFace": false and explain in "clarityError".

Return a strict, valid JSON object matching this structure:
{
  "isClearFace": <boolean: true if clear human face portrait, false if too blurry, dark, obscured, or not a human face>,
  "clarityError": <string or null: if isClearFace is false, give polite feedback e.g. "The image is too blurry or dimly lit to identify facial landmarks. Please upload a clear, front-facing portrait in good lighting.">,
  "attractivenessScore": <number between 1 and 100 reflecting overall aesthetic symmetry and proportion>,
  "harmonyTier": <string describing aesthetic tier, e.g. "Exceptional Facial Harmony", "Superior Neoclassical Balance", "High Harmonic Symmetry">,
  "summary": <string concise 2-sentence clinical breakdown of the face>,
  "symmetry": {
    "score": <number 1-100>,
    "details": <string describing bilateral symmetry of eyes, nose, lips>,
    "leftRightVariance": <string e.g. "1.9% deviation">
  },
  "goldenRatio": {
    "score": <number 1-100>,
    "phiDeviation": <string describing vertical thirds: forehead-to-brow, brow-to-subnasale, subnasale-to-menton>,
    "thirdsAdherence": <string e.g. "33.2% / 33.8% / 33.0% ratio">
  },
  "jawline": {
    "score": <number 1-100>,
    "gonialAngle": <string measured gonial angle e.g. "122°">,
    "definition": <string mandibular sharpness and contour assessment>
  },
  "cheekbones": {
    "score": <number 1-100>,
    "prominence": <string zygomatic arch prominence and projection>,
    "midfaceRatio": <string ratio of midface to total facial height>
  },
  "canthalTilt": {
    "score": <number 1-100>,
    "tiltType": <string e.g. "Positive Canthal Tilt (+4.2°)", "Neutral Canthal Tilt (0.0°)", or "Negative Canthal Tilt (-2.1°)">,
    "eyeSpacing": <string inner and outer canthus evaluation vs horizontal fifths>
  },
  "biologicalAge": {
    "estimatedAge": <number realistic estimated age in years based on tissue elasticity, volume and features>,
    "confidenceRange": <string e.g. "23-27 yrs">,
    "skinVitalityScore": <number 1-100>,
    "observations": <string brief observation of skin texture and volume>
  },
  "keyStrengths": [
    <string strength 1>,
    <string strength 2>,
    <string strength 3>
  ],
  "recommendations": [
    <string practical aesthetic/grooming tip 1>,
    <string practical aesthetic/grooming tip 2>
  ]
}

Only return the JSON object. Do not enclose in markdown blocks.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const text = response.text || '';
    try {
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      if (parsed.isClearFace === false) {
        return res.json({
          isClearFace: false,
          clarityError: parsed.clarityError || 'No face detected. Please upload a clear, well-lit photo of a single human face facing the camera.'
        });
      }
      return res.json({
        ...parsed,
        isClearFace: true
      });
    } catch (parseErr) {
      console.warn('Gemini response JSON parse error:', parseErr);
      return res.status(500).json({ isClearFace: false, error: 'Unable to parse AI response' });
    }
  } catch (error: any) {
    console.error('Face analysis error:', error);
    return res.status(500).json({ isClearFace: false, error: 'Face analysis service error' });
  }
});

// Setup Vite in development or static serve in production
async function startServer() {
  const fs = await import('fs');

  // Explicit endpoints for robots.txt and sitemap.xml
  app.get('/robots.txt', (_req, res) => {
    res.type('text/plain');
    const robotsPath = path.resolve(__dirname, 'robots.txt');
    if (fs.existsSync(robotsPath)) {
      res.sendFile(robotsPath);
    } else {
      res.send("User-agent: *\nAllow: /\nSitemap: https://toolgenie.ai/sitemap.xml\n");
    }
  });

  app.get('/sitemap.xml', (_req, res) => {
    res.type('application/xml');
    const sitemapPath = path.resolve(__dirname, 'sitemap.xml');
    if (fs.existsSync(sitemapPath)) {
      res.sendFile(sitemapPath);
    } else {
      res.status(404).send('Not found');
    }
  });

  // Serve static assets from public/
  app.use(express.static(path.resolve(__dirname, 'public')));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      try {
        const url = req.path;
        let fileToServe = 'index.html';

        if (url.startsWith('/blog')) {
          fileToServe = 'blog.html';
        } else if (url.startsWith('/contact')) {
          fileToServe = 'contact.html';
        }

        const filePath = path.resolve(__dirname, fileToServe);
        if (fs.existsSync(filePath)) {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const html = await vite.transformIndexHtml(req.originalUrl, raw);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
        } else {
          const raw = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
          const html = await vite.transformIndexHtml(req.originalUrl, raw);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
        }
      } catch (e) {
        next(e);
      }
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('/blog', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'blog.html'));
    });
    app.get('/contact', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'contact.html'));
    });
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tool Genie server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
