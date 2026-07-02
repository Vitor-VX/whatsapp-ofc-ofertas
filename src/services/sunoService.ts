import axios from "axios";
import OpenAI from "openai";
import { logger } from "../logger";

const SUNO_BASE_URL = "https://api.sunoapi.org/api/v1";
const SUNO_API_KEY = process.env.SUNO_API_KEY as string;
const SUNO_MODEL = process.env.SUNO_MODEL || "V4_5ALL";

if (!SUNO_API_KEY) {
    logger.warn("[sunoService] SUNO_API_KEY não configurada no .env");
}

const sunoClient = axios.create({
    baseURL: SUNO_BASE_URL,
    headers: {
        Authorization: `Bearer ${SUNO_API_KEY}`,
        "Content-Type": "application/json",
    },
    timeout: 30000,
});

interface GenerateMusicParams {
    prompt: string;
    style?: string;
    title?: string;
    instrumental?: boolean;
}

export interface SunoTrack {
    id: string;
    audioUrl: string;
    title: string;
    tags: string;
    duration: number;
}

interface FlowData {
    honoreeName: string;
    relationship: string;
    specialMessage: string;
    musicStyle: string;
    customStyle?: string | null;
    voicePreference: string;
    specialQuality?: string | null;
    feelingsDetails?: string | null;
}

const SUNO_CALLBACK_URL = process.env.SUNO_CALLBACK_URL as string;

if (!SUNO_CALLBACK_URL) {
    logger.warn("[sunoService] SUNO_CALLBACK_URL não configurada no .env");
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY,
});

export async function generateSong(flow: FlowData) {
    const style =
        flow.musicStyle?.toLowerCase() === "outro" && flow.customStyle
            ? flow.customStyle
            : flow.musicStyle;

    const contextParts = [
        `A música é uma homenagem para ${flow.honoreeName}, que é ${flow.relationship}.`,
        flow.specialMessage && `Mensagem principal: ${flow.specialMessage}.`,
        flow.specialQuality && `Qualidade marcante: ${flow.specialQuality}.`,
        flow.feelingsDetails && `Sentimentos envolvidos: ${flow.feelingsDetails}.`,
    ].filter(Boolean);

    const prompt = `
${contextParts.join("\n")}

Crie uma LETRA DE MÚSICA completa.

Regras:
- Estilo: ${style}
- Idioma: português
- Deve ser emocional e personalizada
- Estrutura obrigatória:
  [Verso 1]
  [Verso 2]
  [Refrão]
  [Verso 3]
  [Refrão Final]

- O refrão deve ser forte e memorável
- Não use frases genéricas
- Faça parecer uma música real, pronta para ser cantada
${flow.voicePreference ? `- A música deve combinar com uma voz ${flow.voicePreference}` : ""}
`;

    const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [
            {
                role: "system",
                content: "Você é um compositor profissional de músicas emocionais.",
            },
            {
                role: "user",
                content: prompt,
            },
        ],
        temperature: 1,
    });

    const lyrics = response.choices[0]?.message?.content?.trim();

    return {
        lyrics,
        style,
        title: `Para ${flow.honoreeName}`,
    };
}

async function generateMusic(params: GenerateMusicParams): Promise<string> {
    const body = {
        prompt: params.prompt,
        customMode: true,
        instrumental: params.instrumental ?? false,
        style: params.style,
        title: params.title,
        model: SUNO_MODEL,
        callBackUrl: SUNO_CALLBACK_URL
    };

    const { data } = await sunoClient.post("/generate", body);

    if (data.code !== 200 || !data.data?.taskId) {
        throw new Error(`Suno generate falhou: ${data.msg ?? "erro desconhecido"}`);
    }

    return data.data.taskId as string;
}

async function getTaskStatus(taskId: string) {
    const { data } = await sunoClient.get("/generate/record-info", {
        params: { taskId },
    });

    if (data.code !== 200) {
        throw new Error(`Suno record-info falhou: ${data.msg ?? "erro desconhecido"}`);
    }

    return data.data as {
        taskId: string;
        status: string;
        response?: { sunoData: SunoTrack[] };
    };
}

const FAILURE_STATUSES = [
    "CREATE_TASK_FAILED",
    "GENERATE_AUDIO_FAILED",
    "CALLBACK_EXCEPTION",
    "SENSITIVE_WORD_ERROR",
];

async function waitForCompletion(
    taskId: string,
    opts: { maxWaitMs?: number; intervalMs?: number } = {}
): Promise<SunoTrack> {
    const maxWaitMs = opts.maxWaitMs ?? 8 * 60 * 1000;
    const intervalMs = opts.intervalMs ?? 5000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < maxWaitMs) {
        const status = await getTaskStatus(taskId);

        logger.debug(`[sunoService] taskId=${taskId} status=${status.status}`);

        if (FAILURE_STATUSES.includes(status.status)) {
            throw new Error(`Geração falhou no Suno (status=${status.status})`);
        }

        if (status.status === "SUCCESS" || status.status === "FIRST_SUCCESS") {
            const track = status.response?.sunoData?.[1];
            if (track?.audioUrl) return track;
            logger.warn(`[sunoService] status=${status.status} mas sem audio_url ainda, tentando de novo`);
        }

        await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(`Timeout aguardando geração da música (taskId=${taskId})`);
}

export const sunoService = {
    generateSong,
    generateMusic,
    getTaskStatus,
    waitForCompletion,
};