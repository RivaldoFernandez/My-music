const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcrypt');

const app = express();

mongoose.connect('mongodb://0.0.0.0:27017/Lab8', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connected!'))
  .catch((error) => console.error('MongoDB connection error:', error));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

const User = mongoose.model('User', userSchema);

const songSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String, required: true },
  album: { type: String },
  genre: { type: String },
  year: { type: Number, required: true },
  coverImage: { type: String },
  audioFile: { type: String },
  isFavorite: { type: Boolean, default: false },
});

const Song = mongoose.model('Song', songSchema);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let dir = '';
    if (file.fieldname === 'coverImage') {
      dir = 'uploads/images';
    } else if (file.fieldname === 'audioFile') {
      dir = 'uploads/music';
    } else {
      return cb(new Error('Tipo de archivo no soportado'));
    }
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10000000 },
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('uploads'));
app.set('view engine', 'ejs');

app.use(session({
  secret: 'mi_clave_secreta',
  resave: false,
  saveUninitialized: true
}));

function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    return next();
  }
  res.redirect('/login');
}

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (!user) {
    return res.status(400).send('Usuario o contraseña incorrectos');
  }
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).send('Usuario o contraseña incorrectos');
  }
  req.session.userId = user._id;
  res.redirect('/');
});

app.get('/', isAuthenticated, async (req, res) => {
  const songs = await Song.find();
  res.render('index', { songs });
});

app.get('/add-song', isAuthenticated, (req, res) => {
  res.render('add-song');
});

app.get('/about', (req, res) => {
  const user = req.user;
  res.render('about', { user });
});

app.post('/add-song', isAuthenticated, upload.fields([{ name: 'coverImage' }, { name: 'audioFile' }]), async (req, res) => {
  if (!req.files['coverImage'] || !req.files['audioFile']) {
    return res.status(400).send('Se requieren archivos de imagen y audio');
  }
  const { title, artist, album, genre, year } = req.body;
  const coverImage = req.files['coverImage'][0].filename;
  const audioFile = req.files['audioFile'][0].filename;

  const newSong = new Song({
    title,
    artist,
    album,
    genre,
    year,
    coverImage,
    audioFile,
  });

  await newSong.save();
  res.redirect('/');
});

app.get('/songs', isAuthenticated, async (req, res) => {
  const songs = await Song.find();
  res.render('songs', { songs });
});

app.get('/edit-song/:id', isAuthenticated, async (req, res) => {
  const song = await Song.findById(req.params.id);
  res.render('edit-song', { song });
});

app.post('/edit-song/:id', isAuthenticated, upload.fields([{ name: 'coverImage' }, { name: 'audioFile' }]), async (req, res) => {
  const { title, artist, album, genre, year } = req.body;
  const coverImage = req.files['coverImage'] ? req.files['coverImage'][0].filename : undefined;
  const audioFile = req.files['audioFile'] ? req.files['audioFile'][0].filename : undefined;

  await Song.findByIdAndUpdate(req.params.id, {
    title,
    artist,
    album,
    genre,
    year,
    coverImage: coverImage || undefined,
    audioFile: audioFile || undefined,
  });

  res.redirect('/songs');
});

app.get('/search', isAuthenticated, async (req, res) => {
  const query = req.query.query;
  let songs;
  if (query) {
    songs = await Song.find({ title: new RegExp(query, 'i') });
  } else {
    songs = await Song.find();
  }
  res.render('index', { songs });
});

app.post('/toggle-favorite/:id', isAuthenticated, async (req, res) => {
  const song = await Song.findById(req.params.id);
  if (song) {
    song.isFavorite = !song.isFavorite;
    await song.save();
  }
  res.status(200).send();
});

app.get('/favoritos', isAuthenticated, async (req, res) => {
  const favoriteSongs = await Song.find({ isFavorite: true });
  res.render('favoritos', { favoriteSongs });
});

app.get('/details/:id', isAuthenticated, async (req, res) => {
  const song = await Song.findById(req.params.id);
  if (!song) {
    return res.status(404).send('Canción no encontrada');
  }
  res.render('details', { song });
});

app.post('/delete-song/:id', isAuthenticated, async (req, res) => {
  try {
    await Song.findByIdAndDelete(req.params.id);
    res.redirect('/songs');
  } catch (error) {
    console.error(error);
    res.status(500).send('Error al eliminar la canción');
  }
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return res.status(400).send('El nombre de usuario ya está en uso');
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({
    username,
    password: hashedPassword
  });
  await newUser.save();
  res.redirect('/login');
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
