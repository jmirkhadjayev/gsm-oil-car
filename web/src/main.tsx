import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { LOCAL_MODE } from './api';

// Montserrat ilova ichiga joylangan (o'zgaruvchan qalinlik, lotin + kirill).
// Tashqi CDN ishlatilmaydi — aeroport tarmog'ida internet bo'lmasa ham ishlaydi.
import '@fontsource-variable/montserrat/wght.css';
import './styles.css';

// GitHub Pages statik xosting — chuqur havolalar (/waybills/5) uchun server tomonida
// yo'naltirish yo'q, shuning uchun demo rejimida hash-marshrutlash ishlatiladi.
const Router = LOCAL_MODE ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>
);
