import express from 'express';
import multer from "multer";
import bodyParser from "body-parser";
import csv from "csv-parser";

const port = 3000;

const upload = multer({ storage: multer.memoryStorage() }); 

const app = express();
app.use(bodyParser.json());
app.get('/', (req, res) => {
  console.log('Received a request at /');
  res.render("index.ejs");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}.`);
});