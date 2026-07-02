import { Schema, model, Document, connection } from "mongoose";

interface IPayment {
    id: string | null;
    link: string | null;
    code: string | null;
    qrCode: string | null;
}

interface IMusic {
    previewUrl: string | null;
    musicUrl: string | null;
    taskId: string | null;
    audioId: string | null;
}

const musicSchema = new Schema<IMusic>(
    {
        previewUrl: { type: String, default: null },
        musicUrl: { type: String, default: null },
        taskId: { type: String, default: null },
        audioId: { type: String, default: null },
    },
    { _id: false }
);

interface IFlowData {
    honoreeName: string;
    relationship: string;
    specialMessage: string;
    musicStyle: string;
    customStyle: string;
    voicePreference: string;

    // opcionais
    specialQuality: string | null;
    feelingsDetails: string | null;
}

export interface IUser extends Document {
    whatsappId: string;
    name: string | null;
    phone: string;
    funnelId: string;
    currentNodeId: string;
    funnelCompleted: boolean;
    funnelStartedAt: Date;
    lastMessageAt: Date;
    windowExpiresAt: Date;
    collectedData: Map<string, string>;
    paymentStatus: "pending" | "paid" | "failed";
    payment: IPayment;
    flowData: IFlowData;
    music: IMusic;
    remarketingSentAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const flowDataSchema = new Schema(
    {
        honoreeName: { type: String, required: true },
        relationship: { type: String, required: true },
        specialMessage: { type: String, required: true },
        musicStyle: { type: String, required: true },
        customStyle: { type: String, default: null },
        voicePreference: { type: String, required: true },

        specialQuality: { type: String, default: null },
        feelingsDetails: { type: String, default: null },
    },
    { _id: false }
);

const paymentSchema = new Schema<IPayment>(
    {
        id: { type: String, default: null },
        link: { type: String, default: null },
        code: { type: String, default: null },
        qrCode: { type: String, default: null },
    },
    { _id: false }
);

const userSchema = new Schema<IUser>(
    {
        whatsappId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        name: {
            type: String,
            default: null,
        },
        phone: {
            type: String,
            required: true,
            index: true,
        },
        funnelId: {
            type: String,
            required: true,
        },
        currentNodeId: {
            type: String,
            required: true,
        },
        funnelCompleted: {
            type: Boolean,
            default: false,
        },
        funnelStartedAt: {
            type: Date,
            default: () => new Date(),
        },
        lastMessageAt: {
            type: Date,
            default: () => new Date(),
        },
        windowExpiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        collectedData: {
            type: Map,
            of: String,
            default: {},
        },
        paymentStatus: {
            type: String,
            enum: ["pending", "paid", "failed"],
            default: "pending",
        },
        flowData: {
            type: flowDataSchema,
            default: null,
        },
        music: {
            type: musicSchema,
            default: () => ({ previewUrl: null, musicUrl: null, taskId: null, audioId: null }),
        },
        payment: {
            type: paymentSchema,
            default: () => ({ id: null, link: null, code: null, qrCode: null }),
        },
        remarketingSentAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

export const User = connection.useDb("whatsapp-ofc").model<IUser>("oferta-musicas", userSchema);