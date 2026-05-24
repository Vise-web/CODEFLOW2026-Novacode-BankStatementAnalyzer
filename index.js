import express from 'express';
import multer from 'multer';
import bodyParser from 'body-parser';
import Papa from 'papaparse';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createRequire } from 'module';
import dotenv from 'dotenv';

dotenv.config();

// DEBUG ENV
console.log(process.env.GEMINI_API_KEY);

const require = createRequire(import.meta.url);
const PDFParser = require('pdf2json');

const app = express();

const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');

app.use(express.static('public'));
app.use(bodyParser.json());

// MEMORY STORAGE
const upload = multer({
  storage: multer.memoryStorage()
});

// GEMINI
const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

// HOME PAGE
app.get('/', (req, res) => {

  res.render('index.ejs');

});

// UPLOAD ROUTE
app.post(
  '/upload',
  upload.single('statement'),
  async (req, res) => {

    console.log('UPLOAD HIT');

    console.log(req.file);

    // NO FILE
    if (!req.file) {

      return res.send(
        'No file uploaded'
      );

    }

    const {
      mimetype,
      originalname,
      buffer
    } = req.file;

    let transactions = [];

    try {

      // CSV FILE
      if (
        mimetype === 'text/csv' ||
        originalname.endsWith('.csv')
      ) {

        console.log('CSV DETECTED');

        const result = Papa.parse(
          buffer.toString(),
          {
            header: true,
            skipEmptyLines: true,
            transformHeader: h =>
              h.trim().toLowerCase(),
          }
        );

        transactions =
          result.data.map(
            row => normalise(row)
          );

      }

      // PDF FILE
      else if (
        mimetype === 'application/pdf' ||
        originalname.endsWith('.pdf')
      ) {

        console.log('PDF DETECTED');

        const text =
          await parsePDF(buffer);

        console.log('PDF TEXT EXTRACTED');

        console.log(text);

        // RAW PDF TEXT
        transactions = [

          {

            date:
              'PDF Upload',

            description:
              text.substring(0, 1000),

            amount:
              0,

            type:
              'info'

          }

        ];

      }

      // INVALID FILE
      else {

        return res.send(
          'Upload PDF or CSV only'
        );

      }

      console.log('TRANSACTIONS CREATED');

      console.log(transactions);

      // GEMINI MODEL
      const model =
        genAI.getGenerativeModel({
          model: 'gemini-1.5-flash'
        });

      console.log('SENDING TO GEMINI');

      // GEMINI REQUEST
      const result =
        await model.generateContent(`

Analyze this bank statement and provide:

1. Total spending
2. Spending categories
3. Saving insights
4. Unusual transactions
5. Financial advice

Statement Data:

${JSON.stringify(transactions)}

`);

      console.log('GEMINI RESPONSE RECEIVED');

      // GEMINI RESPONSE
      const aiResponse =
        result.response.text();

      console.log(aiResponse);

      // RESULT PAGE
      res.render('result.ejs', {

        count:
          transactions.length,

        transactions,

        analysis:
          aiResponse

      });

    }

    catch (err) {

      console.error('FULL ERROR:');

      console.error(err);

      res.send(err.message);

    }

  }
);

// PDF PARSER
function parsePDF(buffer) {

  return new Promise((resolve, reject) => {

    const pdfParser =
      new PDFParser();

    pdfParser.on(
      'pdfParser_dataError',
      err => reject(err)
    );

    pdfParser.on(
      'pdfParser_dataReady',
      pdfData => {

        let text = '';

        pdfData.Pages.forEach(page => {

          page.Texts.forEach(txt => {

            txt.R.forEach(r => {

              try {

                text +=
                  decodeURIComponent(r.T)
                  + ' ';

              }

              catch {

                text +=
                  r.T + ' ';

              }

            });

          });

          text += '\n';

        });

        resolve(text);

      }
    );

    pdfParser.parseBuffer(buffer);

  });

}

// NORMALISE CSV
function normalise(row) {

  return {

    date:
      row.date ||
      row['transaction date'] ||
      '',

    description:
      (
        row.description ||
        row.narration ||
        row.details ||
        ''
      )
      .trim()
      .toLowerCase(),

    amount:
      parseFloat(
        row.amount ||
        row.debit ||
        row.credit ||
        0
      ),

    type:
      row.debit
        ? 'debit'
        : 'credit',

  };

}

// START SERVER
app.listen(port, () => {

  console.log(
    `Server running on port ${port}`
  );

});