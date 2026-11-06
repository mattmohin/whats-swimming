import React from 'react';
import { createRoot } from 'react-dom/client';
import WhatsSwimming, { type Fish } from './WhatsSwimming';
import './styles.css';

const loadCatalogue = async (signal: AbortSignal): Promise<Fish[]> => {
  const response = await fetch(`${import.meta.env.BASE_URL}data/fish.json`, { signal });
  if (!response.ok) throw new Error(`Catalogue request failed: ${response.status}`);
  return response.json() as Promise<Fish[]>;
};

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><WhatsSwimming loadCatalogue={loadCatalogue} /></React.StrictMode>,
);
