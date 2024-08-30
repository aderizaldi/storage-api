import express, { Request, Response, NextFunction } from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";

// Load environment variables from .env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS
app.use(cors());

// Middleware untuk memvalidasi API key
const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers["x-api-key"]; // API key dikirimkan melalui header `x-api-key`
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(403).json({ message: "Forbidden: Invalid API Key" });
  }
  next();
};

// Set up folder static untuk mengakses file secara publik
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")));

// Konfigurasi multer dengan destination dinamis
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Ambil path dari query atau body request (misal: "file/dokumentasi")
    const userPath = req.body.path || req.query.path || "";

    //change userPath to lowercase and remove all non-alphanumeric characters except "/"
    const normalizedPath = userPath
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\/]+/g, "/");

    // Tentukan direktori tujuan berdasarkan userPath atau default ke 'public/uploads'
    const uploadPath = path.join(
      __dirname,
      "../public/uploads",
      normalizedPath
    );

    // Cek apakah direktori sudah ada, jika tidak maka buat direktori tersebut
    fs.mkdir(uploadPath, { recursive: true }, (err) => {
      if (err) {
        return cb(new Error("Failed to create directory."), "");
      }
      cb(null, uploadPath);
    });
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);
    const originalName = path
      .basename(file.originalname, extension)
      .replace(/[^a-zA-Z0-9]+/g, "-");
    const filename = `${Date.now()}-${originalName}${extension}`;
    cb(null, filename);
  },
});

// Middleware multer untuk mengupload file
const upload = multer({ storage });

// Endpoint upload yang menggunakan middleware validasi API key
app.post(
  "/upload",
  validateApiKey,
  upload.array("files"),
  (req: Request, res: Response) => {
    if (!req.files || !Array.isArray(req.files)) {
      return res.status(400).json({ message: "No files were uploaded." });
    }

    res.status(200).json({
      message: "Files uploaded successfully.",
      files: req.files.map((file) => ({
        originalname: file.originalname,
        filename: file.filename,
        path: file.path.replace(path.join(__dirname, "../public"), ""), // Simplify the path
      })),
    });
  }
);

// Endpoint delete yang menggunakan middleware validasi API key
app.delete("/delete", validateApiKey, (req: Request, res: Response) => {
  // Ambil query parameter 'filenames' dan 'path'
  const { filenames } = req.query;

  // Jika query parameter 'filenames' tidak ada, kembalikan response 400
  if (!filenames) {
    return res.status(400).json({ message: "Filenames are required." });
  }

  // Ubah 'filenames' dari string menjadi array
  const filesArray = Array.isArray(filenames)
    ? filenames
    : String(filenames).split(",");

  // Tentukan direktori target, default ke public/uploads jika userPath tidak diberikan
  const files = filesArray.map((filename) => {
    const filePath = path.join(
      __dirname,
      "../public", // Tentukan folder utama
      String(filename)
    );

    return filePath;
  });

  // Hapus semua file menggunakan Promise.all
  Promise.all(
    files.map((filePath) =>
      fs.promises.unlink(filePath).catch((err) => {
        // Jika ada error, tangkap dan kembalikan error
        return err;
      })
    )
  )
    .then((results) => {
      // Filter semua errors yang terjadi
      const errors = results.filter((result) => result instanceof Error);

      if (errors.length > 0) {
        // Jika ada errors, kembalikan response dengan error
        return res.status(500).json({
          message: "Error deleting files.",
          errors: errors.map((error) => (error as Error).message),
        });
      }

      // Jika tidak ada errors, kembalikan response sukses
      res.status(200).json({ message: "Files deleted successfully." });
    })
    .catch((err) => {
      // Tangani unexpected errors
      res
        .status(500)
        .json({ message: "Error deleting files.", error: err.message });
    });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
