/**
 * Hangman game plugin
 * Game state is stored internally per chat.
 */

// Game states
const activeGames        = new Map(); // chatId -> { word, theme, lives, progress }
const activeParticipants = new Map(); // chatId -> Set of participantes (jid -> name)

// Sample words
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const words = JSON.parse(
  await readFile(join(__dirname, "words.json"), "utf8")
);

// Generate word with underscores
const generateProgress = word => word.replace(/\p{L}/gu, "_");

// Normalize a letter attempt: strip accents for comparison, lowercase
const normalizeLetter = l =>
  l.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export default async function (ctx) {
  const { msg } = ctx;
  const chatId  = ctx.chat.id;
  const prefix  = ctx.config.get("CMD_PREFIX");
  const { t }   = ctx.i18n.createT(import.meta.url);
  const sub = msg.args[1];

  // ── Main game command ─────────────────────────────────────
  if (msg.is(prefix + "forca")) {
    if (!sub) {
      await ctx.send(
        `${t("title")}\n\n` +
        `\`${prefix}forca ${t("startCommand")}\` — ${t("startCommandHelp")}\n` +
        `\`${prefix}forca ${t("stopCommand")}\` — ${t("stopCommandHelp")}`
      );
      return;
    }

    const lang  = ctx.config.get("LANGUAGE");
    const WORDS = words[lang] ?? words.en;

    if (sub === "start") {
      // Bug fix #6: avisa se já tem jogo rolando
      if (activeGames.has(chatId)) {
        await ctx.send(t("alreadyRunning"));
        return;
      }

      const random = WORDS[Math.floor(Math.random() * WORDS.length)];
      activeGames.set(chatId, {
        word:     random.word.toLowerCase(),
        theme:    random.theme,
        lives:    6,
        progress: generateProgress(random.word),
        guessed:  new Set(), // letras já tentadas
      });
      activeParticipants.set(chatId, new Map());

      await ctx.send(
        t("started", {
          theme: random.theme,
          word:  generateProgress(random.word),
          lives: 6,
        })
      );
      return;
    }

    if (sub === "stop") {
      if (!activeGames.has(chatId)) {
        await ctx.send(t("noGame"));
        return;
      }
      const game = activeGames.get(chatId);
      activeGames.delete(chatId);
      activeParticipants.delete(chatId);
      await ctx.send(t("stopped", { word: game.word }));
      return;
    }

    await ctx.send(
      `${t("invalidCommand", { sub })} \`${prefix}forca start\` ${t("or")} \`${prefix}forca stop\`.`
    );
    return;
  }

  // ── Game attempts ─────────────────────────────────────────
  const game = activeGames.get(chatId);
  if (!game) return;

  const raw     = msg.body.trim();
  const attempt = raw.toLowerCase();

  if (!/^\p{L}$/u.test(attempt)) return;

  const normalized = normalizeLetter(attempt);
  if (game.guessed.has(normalized)) {
    await msg.reply(t("alreadyGuessed", { letter: attempt }));
    return;
  }
  game.guessed.add(normalized);

  const participants = activeParticipants.get(chatId);
  const senderId     = msg.sender?.id ?? msg.key?.participant ?? "unknown";
  const senderName   = msg.pushName ?? senderId;
  if (!participants.has(senderId)) {
    participants.set(senderId, senderName);
  }

  let hit        = false;
  let newProgress = game.progress.split("");

  for (let i = 0; i < game.word.length; i++) {
    if (normalizeLetter(game.word[i]) === normalized) {
      newProgress[i] = game.word[i]; // preserva o caractere original
      hit = true;
    }
  }

  game.progress = newProgress.join("");
  if (!hit) game.lives--;

  if (game.progress === game.word) {
    const winners = [...participants.values()].join(", ") || t("nobody");
    await msg.reply(t("won", { word: game.word, participants: winners }));
    activeGames.delete(chatId);
    activeParticipants.delete(chatId);
    return;
  }

  if (game.lives <= 0) {
    await msg.reply(t("lost", { word: game.word }));
    activeGames.delete(chatId);
    activeParticipants.delete(chatId);
    return;
  }

  await msg.reply(
    `${t("status", { word: game.progress, lives: game.lives })}\n` +
    (hit ? t("correct") : t("wrong"))
  );
}
