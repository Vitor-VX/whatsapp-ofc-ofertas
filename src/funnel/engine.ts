import { IUser } from '../models/User';
import { Funnel, FunnelNode } from './nodeTypes';

export class FunnelEngine {
    private funnel: Funnel;

    constructor(funnel: Funnel) {
        this.funnel = funnel;
    }

    /**
     * Load a funnel from JSON definition
     */
    static loadFunnel(funnelJson: Funnel): FunnelEngine {
        return new FunnelEngine(funnelJson);
    }

    /**
     * Get current node for user
     */
    getNode(nodeId: string): FunnelNode | null {
        return this.funnel.nodes[nodeId] || null;
    }

    /**
     * Get start node
     */
    getStartNode(): FunnelNode | null {
        return this.getNode(this.funnel.startNode);
    }

    /**
     * Check if node is a terminal node (end or no nextNode)
     */
    isTerminalNode(node: FunnelNode): boolean {
        return node.type === 'end' || !node.nextNode;
    }

    /**
     * Replace variables in text content
     * Supports: {{petName}}, {{name}}, {{generatedImageUrl}}, etc
     */
    interpolateText(text: string, user: IUser): string {
        let result = text;

        const data = user.collectedData instanceof Map
            ? Object.fromEntries(user.collectedData)
            : user.collectedData;

        for (const [key, value] of Object.entries(data)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(regex, String(value));
        }

        if (user.name) {
            result = result.replace(/{{name}}/g, user.name);
        }

        return result;
    }

    /**
     * Get next node ID based on button selection
     * Used for button and list nodes
     */
    getNextNodeForSelection(node: FunnelNode, selectedId: string): string | null {
        if (node.type === 'buttons') {
            const button = node.buttons.find((b) => b.id === selectedId);
            return button?.nextNode || null;
        }

        if (node.type === 'list') {
            for (const section of node.sections) {
                const row = section.rows.find((r) => r.id === selectedId);
                if (row) {
                    return row.nextNode;
                }
            }
        }

        if (node.type === 'cards') {
            for (const card of (node as any).cards) {
                const button = card.buttons.find((b: any) => b.id === selectedId);
                if (button) {
                    return button.nextNode || null;
                }
            }
        }

        return null;
    }

    /**
     * Validate input based on waitInput node validation rules
     */
    validateInput(node: FunnelNode, input: string): boolean {
        if (node.type !== 'waitInput') {
            return true;
        }

        if (!node.validation) {
            return true;
        }

        switch (node.validation) {
            case 'email':
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
            case 'phone':
                return /^\+?[\d\s\-()]+$/.test(input) && input.length >= 10;
            case 'text':
            default:
                return input.length > 0;
        }
    }

    /**
     * Get funnel ID
     */
    getFunnelId(): string {
        return this.funnel.id;
    }

    /**
     * Get funnel name
     */
    getFunnelName(): string {
        return this.funnel.name;
    }

    /**
     * Get all nodes (useful for debugging)
     */
    getAllNodes(): Record<string, FunnelNode> {
        return this.funnel.nodes;
    }
}
