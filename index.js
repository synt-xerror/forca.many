/**
 * Hangman game plugin
 * Game state is stored internally per chat.
 */

import { readFile }                  from "node:fs/promises";
import { dirname, join }             from "node:path";
import { fileURLToPath }             from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const words     = JSON.parse(await readFile(join(__dirname, "words.json"), "utf8"));

const activeGames        = new Map();
const activeParticipants = new Map();

const generateProgress = word => word.replace(/\p{L}/gu, "_");
const normalize        = l => l.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default async function (ctx) {
  const { msg, chat, config, i18n, send } = ctx;
  const chatId = chat.id;
  const prefix = config.get("CMD_PREFIX");
  const { t }  = i18n.createT(import.meta.url);

  // ── Comando !forca ────────────────────────────────────────
  if (msg.command === "forca") {
    const sub   = msg.args[0];
    const lang  = config.get("LANGUAGE");
    const WORDS = words[lang] ?? words.en;

    if (!sub) {
      await send.text(
        `${t("title")}\n\n` +
        `\`${prefix}forca ${t("startCommand")}\` — ${t("startCommandHelp")}\n` +
        `\`${prefix}forca ${t("stopCommand")}\` — ${t("stopCommandHelp")}`
      );
      return;
    }

    if (sub === t("startCommand")) {
      if (activeGames.has(chatId)) {
        await send.text(t("alreadyRunning"));
        return;
      }

      const random   = WORDS[Math.floor(Math.random() * WORDS.length)];
      const word     = random.word.toLowerCase();
      activeGames.set(chatId, { word, theme: random.theme, lives: 6, progress: generateProgress(random.word), guessed: new Set() });
      activeParticipants.set(chatId, new Map());

      await send.text(t("started", { theme: random.theme, word: generateProgress(random.word), lives: 6 }));
      return;
    }

    if (sub === t("stopCommand")) {
      if (!activeGames.has(chatId)) {
        await send.text(t("noGame"));
        return;
      }
      const game = activeGames.get(chatId);
      activeGames.delete(chatId);
      activeParticipants.delete(chatId);
      await send.text(t("stopped", { word: game.word }));
      return;
    }

    await send.text(`${t("invalidCommand", { sub })} \`${prefix}forca start\` ${t("or")} \`${prefix}forca stop\`.`);
    return;
  }

  // ── Tentativa de letra ────────────────────────────────────
  const game = activeGames.get(chatId);
  if (!game) return;

  const attempt = msg.body.trim().toLowerCase();
  if (!/^\p{L}$/u.test(attempt)) return;

  const normalized = normalize(attempt);
  if (game.guessed.has(normalized)) {
    await msg.reply.text(t("alreadyGuessed", { letter: attempt }));
    return;
  }
  game.guessed.add(normalized);

  const participants = activeParticipants.get(chatId);
  if (!participants.has(msg.sender)) participants.set(msg.sender, msg.senderName);

  const newProgress = [...game.progress];
  let hit = false;
  for (let i = 0; i < game.word.length; i++) {
    if (normalize(game.word[i]) === normalized) {
      newProgress[i] = game.word[i];
      hit = true;
    }
  }
  game.progress = newProgress.join("");
  if (!hit) game.lives--;

  if (game.progress === game.word) {
    const winners = [...participants.values()].join(", ") || t("nobody");
    await msg.reply.text(t("won", { word: game.word, participants: winners }));
    activeGames.delete(chatId);
    activeParticipants.delete(chatId);
    return;
  }

  if (game.lives <= 0) {
    await msg.reply.text(t("lost", { word: game.word }));
    activeGames.delete(chatId);
    activeParticipants.delete(chatId);
    return;
  }

  await msg.reply.text(
    `${t("status", { word: game.progress, lives: game.lives })}\n` +
    (hit ? t("correct") : t("wrong"))
  );
}
