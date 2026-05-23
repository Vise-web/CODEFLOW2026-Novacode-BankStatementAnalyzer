import express from 'express';
import multer from 'multer';
import bodyParser from 'body-parser';
import Papa from 'papaparse';
import pdfParse from 'pdf-parse';

const port = 3000;
const upload = multer({ storage: multer.memoryStorage() });
const app = express();
app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.render("index.ejs");
});

app.post('/upload', upload.single('statement'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { mimetype, originalname, buffer } = req.file;
  let transactions = [];

  try {
    // ── CSV ──────────────────────────────────────────────────────────────
    if (mimetype === 'text/csv' || originalname.endsWith('.csv')) {
      const result = Papa.parse(buffer.toString(), {
        header: true,
        skipEmptyLines: true,
        transformHeader: h => h.trim().toLowerCase(),
      });

      if (result.errors.length) {
        return res.status(400).json({ error: 'CSV parse error', details: result.errors });
      }

      transactions = result.data.map(row => normalise(row));

    // ── PDF ──────────────────────────────────────────────────────────────
    } else if (mimetype === 'application/pdf' || originalname.endsWith('.pdf')) {
      const { text } = await pdfParse(buffer);
      transactions = extractFromPdfText(text);

    } else {
      return res.status(415).json({ error: 'Unsupported file type. Upload a CSV or PDF.' });
    }

    // transactions is now a clean array ready for your analysis functions
    res.json({ count: transactions.length, transactions });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to parse file', details: err.message });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Normalise a CSV row — adjust field names to match your bank's columns
function normalise(row) {
  return {
    date:        row.date        || row['transaction date'] || '',
    description: (row.description || row.narration || row.details || '').trim().toLowerCase(),
    amount:      parseFloat(row.amount || row.debit || row.credit || 0),
    type:        row.debit ? 'debit' : 'credit',
  };
}

// Extract transactions from raw PDF text using regex
// This pattern looks for lines 
// Adjust the regex to match your bank's PDF layout
function extractFromPdfText(text) {
  const lines = text.split('\n');
  const txnPattern = /(\d{2}[\/\-]\d{2}[\/\-]\d{4})\s+(.+?)\s+([\-\d,]+\.\d{2})/;
  const transactions = [];

  for (const line of lines) {
    const match = line.match(txnPattern);
    if (match) {
      const amount = parseFloat(match[3].replace(/,/g, ''));
      transactions.push({
        date:        match[1],
        description: match[2].trim().toLowerCase(),
        amount:      Math.abs(amount),
        type:        amount < 0 ? 'debit' : 'credit',
      });
    }
  }

  return transactions;
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});