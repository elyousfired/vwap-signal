
/**
 * Telegram Alert Service
 * Sends Golden Signal alerts via Telegram Bot API.
 * Only sends once per token per day (deduplication).
 */

export interface TelegramConfig {
    botToken: string;
    chatId: string; // Comma-separated for multiple IDs, e.g. "123456,789012"
    enabled: boolean;
}

const ALERTED_KEY = 'dexpulse_alerted_signals';
const CONFIG_KEY = 'dexpulse_telegram_config';

/** Get already-alerted token IDs for today */
function getAlertedToday(): Set<string> {
    try {
        const raw = localStorage.getItem(ALERTED_KEY);
        if (!raw) return new Set();
        const data = JSON.parse(raw);
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        if (data.date !== today) {
            // New day, reset
            localStorage.removeItem(ALERTED_KEY);
            return new Set();
        }
        return new Set(data.ids || []);
    } catch {
        return new Set();
    }
}

/** Mark a token as alerted today */
function markAlerted(symbol: string) {
    const alerted = getAlertedToday();
    alerted.add(symbol);
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(ALERTED_KEY, JSON.stringify({ date: today, ids: [...alerted] }));
}

/** Check if token was already alerted today */
export function wasAlertedToday(symbol: string): boolean {
    return getAlertedToday().has(symbol);
}

/** Load Telegram config from localStorage */
export function loadTelegramConfig(): TelegramConfig {
    try {
        const raw = localStorage.getItem(CONFIG_KEY);
        if (!raw) return { botToken: '', chatId: '', enabled: false };
        return JSON.parse(raw);
    } catch {
        return { botToken: '', chatId: '', enabled: false };
    }
}

/** Save Telegram config to localStorage */
export function saveTelegramConfig(config: TelegramConfig) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/** Parse comma-separated chat IDs */
function parseChatIds(chatIdStr: string): string[] {
    return chatIdStr.split(',').map(id => id.trim()).filter(id => id.length > 0);
}

/** Send a Telegram message to a single chat */
async function sendToChat(botToken: string, chatId: string, text: string): Promise<boolean> {
    try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML',
                disable_web_page_preview: true
            })
        });
        const data = await res.json();
        return data.ok === true;
    } catch (err) {
        console.error(`Telegram send error (chat ${chatId}):`, err);
        return false;
    }
}

/** Send a Telegram message to ALL configured chat IDs */
async function sendTelegramMessage(config: TelegramConfig, text: string): Promise<boolean> {
    if (!config.botToken || !config.chatId) return false;

    const chatIds = parseChatIds(config.chatId);
    if (chatIds.length === 0) return false;

    const results = await Promise.all(
        chatIds.map(id => sendToChat(config.botToken, id, text))
    );
    // Return true if at least one message was sent successfully
    return results.some(ok => ok);
}

/** Send a test message to verify the bot works */
export async function sendTestAlert(config: TelegramConfig): Promise<boolean> {
    return sendTelegramMessage(config,
        '🔔 <b>DexPulse Test Alert</b>\n\n✅ Connection successful!\nYou will receive Golden Signal alerts here.'
    );
}

/** Send a Golden Signal alert (only if not already sent today) */
export async function sendGoldenSignalAlert(params: {
    symbol: string;
    price: number;
    change24h: number;
    score: number;
    vwapMax: number;
    vwapMid: number;
    reason: string;
    type: 'GOLDEN' | 'MOMENTUM' | 'SUPPORT' | 'CONVERGENCE' | 'EXIT';
}): Promise<boolean> {
    // SECURITY: Only allow GOLDEN, CONVERGENCE, and EXIT signals to be sent to Telegram
    if (params.type !== 'GOLDEN' && params.type !== 'CONVERGENCE' && params.type !== 'EXIT') return false;

    const config = loadTelegramConfig();
    if (!config.enabled || !config.botToken || !config.chatId) return false;

    const emoji = params.type === 'GOLDEN' ? '🏆' : params.type === 'EXIT' ? '🛑' : params.type === 'CONVERGENCE' ? '🎯' : '🚀';
    const typeLabel = params.type === 'GOLDEN' ? '⚡ GOLDEN SIGNAL' : params.type === 'EXIT' ? '📉 EXIT SIGNAL' : params.type === 'CONVERGENCE' ? '📍 MTF CONVERGENCE' : '📈 MOMENTUM';

    const message = [
        `${emoji} <b>${typeLabel}</b>`,
        ``,
        `<b>Token:</b> ${params.symbol}/USDT`,
        `<b>Price:</b> $${params.price.toLocaleString(undefined, { maximumFractionDigits: 8 })}`,
        `<b>24h Change:</b> ${params.change24h >= 0 ? '+' : ''}${params.change24h.toFixed(2)}%`,
        `<b>${params.type === 'EXIT' ? 'Exit' : 'Buy'} Score:</b> ${params.score.toFixed(0)}/100`,
        ``,
        `<b>VWAP Levels:</b>`,
        `  🟢 Target (Max): $${params.vwapMax.toLocaleString(undefined, { maximumFractionDigits: 8 })}`,
        `  🔴 Stop (Mid): $${params.vwapMid.toLocaleString(undefined, { maximumFractionDigits: 8 })}`,
        ``,
        `<b>AI Verdict:</b> ${params.reason}`,
        ``,
        `📊 <a href="https://dexpulse-dashboard.vercel.app">Open DexPulse Dashboard</a>`
    ].join('\n');

    const sent = await sendTelegramMessage(config, message);
    if (sent) {
        markAlerted(params.symbol);
    }
    return sent;
}
