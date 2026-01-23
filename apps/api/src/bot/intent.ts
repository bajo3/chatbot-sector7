export type IntentKind =
  | 'SEARCH'
  | 'PRICE'
  | 'INSTALLMENTS'
  | 'HUMAN'
  | 'MORE'
  | 'UNKNOWN'
  | 'BUY_SIGNAL';

export type Intent = {
  kind: IntentKind;
  query?: string;
  scoreDelta: number;
};

const buyKeywords = [
  'llevo','lo llevo','comprar','compro','reservo','reserva','seño','seña','paso',
  'transferencia','retiro','cuando puedo pasar','me lo guardas','me lo guardás'
];

const priceKeywords = ['precio','cuanto sale','cuánto sale','vale','valor','cuanto está','cuánto está'];
const installmentsKeywords = ['cuotas','financi','tarjeta','plan','pago en cuotas'];
const humanKeywords = ['hablar con alguien','asesor','vendedor','humano','atencion','atención','me atendés','me atiendes'];
const moreKeywords = [
  'mas',
  'más',
  'ver opciones',
  'opciones',
  'otra',
  'otras',
  'otra opcion',
  'otra opción',
  'más opciones',
  'mas opciones',
  'dale',
  'de una',
  'manda',
  'mandame',
  'mostrame',
  'seguimos'
];

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
}

export function detectIntent(text: string, interactiveId?: string): Intent {
  const t = norm(text || '');

  if (interactiveId) {
    if (interactiveId === 'HUMAN') return { kind:'HUMAN', scoreDelta: 5 };
    if (interactiveId === 'INSTALLMENTS') return { kind:'INSTALLMENTS', scoreDelta: 2 };
    if (interactiveId === 'MORE') return { kind:'MORE', scoreDelta: 1 };
    if (interactiveId.startsWith('PICK:')) return { kind:'SEARCH', query: interactiveId.slice(5), scoreDelta: 2 };
    if (interactiveId === 'BUY') return { kind:'BUY_SIGNAL', scoreDelta: 6 };
  }

  if (buyKeywords.some(k => t.includes(norm(k)))) return { kind:'BUY_SIGNAL', scoreDelta: 6 };
  if (humanKeywords.some(k => t.includes(norm(k)))) return { kind:'HUMAN', scoreDelta: 4 };
  if (installmentsKeywords.some(k => t.includes(norm(k)))) return { kind:'INSTALLMENTS', scoreDelta: 2 };
  if (priceKeywords.some(k => t.includes(norm(k)))) return { kind:'PRICE', scoreDelta: 2 };

  // "más" / "ver opciones" / "dale" style follow-ups
  if (moreKeywords.some(k => t.includes(norm(k)))) return { kind: 'MORE', scoreDelta: 1 };

  // search heuristics: if contains known categories or product-like terms
  const searchHints = ['silla', 'sillas', 'gamer', 'ps5', 'play', 'joystick', 'mouse', 'teclado', 'monitor', 'auricular', 'parlante', 'notebook', 'pc'];
  if (searchHints.some(k => t.includes(k))) return { kind:'SEARCH', query: text, scoreDelta: 1 };

  // if message is short noun-like
  if (t.trim().split(/\s+/).length <= 4 && t.trim().length >= 2) return { kind:'SEARCH', query: text, scoreDelta: 1 };

  return { kind:'UNKNOWN', scoreDelta: 0 };
}
