import { Schema, model, Document, connection } from "mongoose";

interface IPayment {
    id: string | null;
    link: string | null;
    code: string | null;
    qrCode: string | null;
}

export interface IEnvelope {
    slug: string;
    qrCode: string;
    title: string;
    message: string;
    signature: string;
    photos: string[];
    paymentId: string | null;
    options: {
        startDate?: Date;
        hasMusic: boolean;
        musicUrl?: string;
        musicName?: string;
    };
    lastAccessAt: Date;
    expiresAt?: Date | null;
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
    clientsImage: string[];
    envelope: IEnvelope[];
    remarketingSentAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

const envelopeOptionsSchema = new Schema(
    {
        startDate: { type: Date, default: null },
        hasMusic: { type: Boolean, default: false },
        musicUrl: { type: String, default: null },
        musicName: { type: String, default: null },
    },
    { _id: false }
);

const envelopeSchema = new Schema<IEnvelope>(
    {
        slug: { type: String, required: true, index: true },
        qrCode: { type: String, default: "" },
        title: { type: String, required: true },
        message: { type: String, required: true },
        signature: { type: String, required: true },
        photos: { type: [String], default: [] },
        paymentId: { type: String, index: true },
        options: { type: envelopeOptionsSchema, default: () => ({}) },
        lastAccessAt: { type: Date, default: () => new Date() },
        expiresAt: { type: Date, default: null },
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
        payment: {
            type: paymentSchema,
            default: () => ({ id: null, link: null, code: null, qrCode: null }),
        },

        clientsImage: {
            type: [String],
            default: [],
        },

        envelope: {
            type: [envelopeSchema],
            default: [],
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

userSchema.index({ whatsappId: 1 });
userSchema.index({ phone: 1 });
userSchema.index({ funnelCompleted: 1 });
userSchema.index({ windowExpiresAt: 1 });
userSchema.index({ paymentStatus: 1 });
userSchema.index({ "envelope.slug": 1 });
userSchema.index({ "envelope.expiresAt": 1 });

export const User = connection.useDb("whatsapp-ofc").model<IUser>("User", userSchema);