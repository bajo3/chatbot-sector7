import axios from 'axios';
import { env } from '../env.js';

const graphBase = 'https://graph.facebook.com/v20.0';

export type SendTextParams = {
  to: string;
  text: string;
  preview_url?: boolean;
};

export type SendImageParams = {
  to: string;
  imageUrl: string;
  caption?: string;
};

export type SendInteractiveButtonsParams = {
  to: string;
  bodyText: string;
  buttons: { id: string; title: string }[];
};

export async function sendText(p: SendTextParams) {
  const url = `${graphBase}/${env.META_PHONE_NUMBER_ID}/messages`;
  return axios.post(url, {
    messaging_product: "whatsapp",
    to: p.to,
    type: "text",
    text: { body: p.text, preview_url: p.preview_url ?? true }
  }, {
    headers: { Authorization: `Bearer ${env.META_WA_TOKEN}` }
  });
}

export async function sendImage(p: SendImageParams) {
  const url = `${graphBase}/${env.META_PHONE_NUMBER_ID}/messages`;
  return axios.post(url, {
    messaging_product: "whatsapp",
    to: p.to,
    type: "image",
    image: { link: p.imageUrl, caption: p.caption }
  }, {
    headers: { Authorization: `Bearer ${env.META_WA_TOKEN}` }
  });
}

export async function sendInteractiveButtons(p: SendInteractiveButtonsParams) {
  const url = `${graphBase}/${env.META_PHONE_NUMBER_ID}/messages`;
  return axios.post(url, {
    messaging_product: "whatsapp",
    to: p.to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: p.bodyText },
      action: {
        buttons: p.buttons.slice(0,3).map(b => ({
          type: "reply",
          reply: { id: b.id, title: b.title }
        }))
      }
    }
  }, {
    headers: { Authorization: `Bearer ${env.META_WA_TOKEN}` }
  });
}
