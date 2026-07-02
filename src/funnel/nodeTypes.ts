/**
 * Funnel Node Type Definitions
 * All possible node types that can exist in a funnel
 */

export interface BaseNode {
    id: string;
    nextNode?: string; // undefined = fim do funil
}

// Texto simples
export interface TextNode extends BaseNode {
    type: 'text';
    content: string; // suporta variáveis: {{name}}, {{petName}}
}

export interface PixNode extends BaseNode {
    type: 'pix';
    content: string;
    key: string;
    keyType: string;
    code: string;
}

export interface CtaUrlNode extends BaseNode {
    type: 'ctaUrl';
    body: string;
    buttonText: string;
    url: string;
    header?: {
        type: 'image' | 'video' | 'document' | 'text';
        value: string;
    };
    footerText?: string;
    nextNode?: string;
}

export interface WaitPhotosNode extends BaseNode {
    type: 'waitPhotos';
    content: string;
    maxPhotos: number;
    debounceMs: number;
}

export interface CardsNode extends BaseNode {
    type: 'cards';
    content: string;
    cards: any[];
}

export interface TemplateNode extends BaseNode {
    type: 'template';
    name: string;
    language: string;
    components: any[]
}

// Imagem
export interface ImageNode extends BaseNode {
    type: 'image';
    url: string;
    caption?: string;
}

// Áudio
export interface AudioNode extends BaseNode {
    type: 'audio';
    url: string; // URL do arquivo de áudio .ogg/opus
}

// Vídeo
export interface VideoNode extends BaseNode {
    type: 'video';
    url: string;
    caption?: string;
}

// Delay (espera X ms antes de ir para o próximo nó)
export interface DelayNode extends BaseNode {
    type: 'delay';
    ms: number;
}

// Simula "digitando..." ou "gravando áudio..."
export interface TypingNode extends BaseNode {
    type: 'typing';
    durationMs: number;
    action: 'typing' | 'recording_audio';
}

// Botões de resposta rápida (até 3 botões — limite da API do Meta)
export interface ButtonNode extends BaseNode {
    type: 'buttons';
    body: string;
    buttons: Array<{
        id: string;
        title: string;
        nextNode: string;
    }>;
}

// Lista de opções (até 10 itens)
export interface ListNode extends BaseNode {
    type: 'list';
    body: string;
    buttonText: string;
    sections: Array<{
        title: string;
        rows: Array<{
            id: string;
            title: string;
            description?: string;
            nextNode: string;
        }>;
    }>;
}

// Aguarda resposta do usuário e salva em collectedData
export interface WaitInputNode extends BaseNode {
    type: 'waitInput';
    saveAs: string;
    content?: string; // optional prompt message
    validation?: 'text' | 'phone' | 'email';
    timeoutMs?: number;
    timeoutNode?: string;
}

// Aguarda o usuário enviar uma FOTO
export interface WaitPhotoNode extends BaseNode {
    type: 'waitPhoto';
    content?: string; // optional prompt message
    saveAs?: string;
    timeoutMs?: number;
    timeoutNode?: string;
}

// Ação customizada
export interface ActionNode extends BaseNode {
    type: 'action';
    action:
    | 'generatePetImage'
    | 'createStripePaymentLink'
    | 'deliverFinalImage'
    | string;
}

// Remarketing: define configuração para envio futuro
export interface RemarketingNode extends BaseNode {
    type: 'remarketing';
    delayMs: number;
    message: string;
    nextNodeAfterRemarketing?: string;
}

// Finaliza o funil explicitamente
export interface EndNode {
    type: 'end';
    id: string;
    message?: string;
}

export type FunnelNode =
    | TextNode
    | ImageNode
    | AudioNode
    | VideoNode
    | DelayNode
    | TypingNode
    | ButtonNode
    | ListNode
    | WaitInputNode
    | WaitPhotoNode
    | ActionNode
    | RemarketingNode
    | PixNode
    | TemplateNode
    | CardsNode
    | WaitPhotosNode
    | CtaUrlNode
    | EndNode;

export interface Funnel {
    id: string;
    name: string;
    startNode: string;
    nodes: Record<string, FunnelNode>;
}

// Type guards
export function isTextNode(node: FunnelNode): node is TextNode {
    return node.type === 'text';
}

export function isImageNode(node: FunnelNode): node is ImageNode {
    return node.type === 'image';
}

export function isAudioNode(node: FunnelNode): node is AudioNode {
    return node.type === 'audio';
}

export function isVideoNode(node: FunnelNode): node is VideoNode {
    return node.type === 'video';
}

export function isDelayNode(node: FunnelNode): node is DelayNode {
    return node.type === 'delay';
}

export function isTypingNode(node: FunnelNode): node is TypingNode {
    return node.type === 'typing';
}

export function isButtonNode(node: FunnelNode): node is ButtonNode {
    return node.type === 'buttons';
}

export function isListNode(node: FunnelNode): node is ListNode {
    return node.type === 'list';
}

export function isWaitInputNode(node: FunnelNode): node is WaitInputNode {
    return node.type === 'waitInput';
}

export function isWaitPhotoNode(node: FunnelNode): node is WaitPhotoNode {
    return node.type === 'waitPhoto';
}

export function isWaitPhotosNode(node: FunnelNode): node is WaitPhotoNode {
    return node.type === 'waitPhotos';
}

export function isActionNode(node: FunnelNode): node is ActionNode {
    return node.type === 'action';
}

export function isRemarketingNode(node: FunnelNode): node is RemarketingNode {
    return node.type === 'remarketing';
}

export function isEndNode(node: FunnelNode): node is EndNode {
    return node.type === 'end';
}

export function isWaitingNode(node: FunnelNode): node is WaitInputNode | WaitPhotoNode {
    return isWaitInputNode(node) || isWaitPhotoNode(node) || isWaitPhotosNode(node);
}

export function isSequentialNode(node: FunnelNode): boolean {
    return (
        isTextNode(node) ||
        isImageNode(node) ||
        isAudioNode(node) ||
        isVideoNode(node) ||
        isDelayNode(node) ||
        isTypingNode(node) ||
        isActionNode(node) ||
        isRemarketingNode(node) ||
        isEndNode(node)
    );
}
