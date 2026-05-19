import { Schema, model, Document, connection } from 'mongoose';

export interface IFunnelSession extends Document {
  userId: string;
  whatsappId: string;
  funnelId: string;
  startedAt: Date;
  completedAt: Date | null;
  nodeHistory: Array<{
    nodeId: string;
    timestamp: Date;
    userInput?: string;
  }>;
  isActive: boolean;
}

const funnelSessionSchema = new Schema<IFunnelSession>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    whatsappId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    funnelId: {
      type: String,
      required: true,
    },
    startedAt: {
      type: Date,
      default: () => new Date(),
    },
    completedAt: {
      type: Date,
      default: null,
    },
    nodeHistory: [
      {
        nodeId: String,
        timestamp: {
          type: Date,
          default: () => new Date(),
        },
        userInput: String,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for performance
funnelSessionSchema.index({ whatsappId: 1 });
funnelSessionSchema.index({ funnelId: 1 });
funnelSessionSchema.index({ isActive: 1 });

export const FunnelSession = connection.useDb("whatsapp-ofc").model<IFunnelSession>('FunnelSession', funnelSessionSchema);
