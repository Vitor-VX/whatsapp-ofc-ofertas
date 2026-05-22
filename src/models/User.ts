import { Schema, model, Document, connection } from 'mongoose';

interface IPayment {
    id: string | null;
    link: string | null;
    code: string | null;
    qrCode: string | null;
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
    paymentStatus: 'pending' | 'paid' | 'failed';
    payment: IPayment;

    // 🔥 NOVO
    originalImages: string[];
    generatedImages: string[];
    generatedPreviews: string[];

    remarketingSentAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

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
            enum: ['pending', 'paid', 'failed'],
            default: 'pending',
        },
        payment: {
            id: { type: String, default: null },
            link: { type: String, default: null },
            code: { type: String, default: null },
            qrCode: { type: String, default: null },
        },

        originalImages: {
            type: [String],
            default: [],
        },
        generatedImages: {
            type: [String],
            default: [],
        },
        generatedPreviews: {
            type: [String],
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

export const User = connection.useDb("whatsapp-ofc").model<IUser>('User', userSchema);
