import { Schema, Document, connection } from "mongoose";

export interface IEnvelope {
    slug: string;
    qrCode: string;
    title: string;
    message: string;
    signature: string;
    photos: string[];
    options: {
        showCounter: boolean;
        startDate?: Date;

        hasMusic: boolean;
        musicUrl?: string;
        musicName?: string;
    };
    lastAccessAt: Date;
    expiresAt?: Date | null;
}

export interface IOrdersEnvelope extends Document {
    customer: {
        name: string;
        whatsapp: string;
        email: string;
    };
    envelope: IEnvelope;
}

const ordersSchema = new Schema<IOrdersEnvelope>(
    {
        customer: {
            name: {
                type: String,
                required: true
            },
            whatsapp: {
                type: String,
                required: true
            },
            email: {
                type: String,
                required: true
            }
        },

        envelope: {
            slug: {
                type: String,
                required: true,
                unique: true
            },
            qrCode: {
                type: String,
                required: true
            },
            title: {
                type: String,
                required: true
            },
            message: {
                type: String,
                required: true
            },
            signature: {
                type: String,
                required: true
            },
            photos: [{
                type: String
            }],
            options: {
                showCounter: {
                    type: Boolean,
                    default: false
                },
                startDate: {
                    type: Date
                },
                hasMusic: {
                    type: Boolean,
                    default: false
                },
                musicName: {
                    type: String,
                    default: ""
                },
                musicUrl: {
                    type: String,
                    default: ""
                }
            },
            lastAccessAt: {
                type: Date,
                default: null
            },
            expiresAt: {
                type: Date,
                default: null
            }
        }
    },
    {
        timestamps: true
    }
);

export const OrdersEnvelope = connection.useDb("").model<IOrdersEnvelope>("orders-envelope", ordersSchema);