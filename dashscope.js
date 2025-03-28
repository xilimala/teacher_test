/**
 * DashScope API 客户端
 * 用于调用阿里云的DashScope API服务，包括语音识别等功能
 */

// DashScope API 客户端
class DashScope {
    constructor() {
        this.apiKey = 'sk-d7773d8633db4fd9ad4b5286fd7a0738';
        this.baseUrl = 'https://dashscope.aliyuncs.com';
        this.audio = {
            asr: {
                Recognition: this._createRecognitionClass()
            }
        };
    }

    // 创建Recognition类
    _createRecognitionClass() {
        const self = this;
        
        return {
            create(options) {
                return {
                    model: options.model || 'paraformer-realtime-v2',
                    format: options.format || 'pcm',
                    sampleRate: options.sampleRate || 16000,
                    callback: options.callback,
                    isRunning: false,
                    
                    // 开始识别
                    start() {
                        this.isRunning = true;
                        if (this.callback && this.callback.onOpen) {
                            this.callback.onOpen();
                        }
                        return this;
                    },
                    
                    // 发送音频帧
                    async sendAudioFrame(audioBuffer) {
                        if (!this.isRunning) return;
                        
                        try {
                            // 将ArrayBuffer转换为Base64
                            const base64Audio = this._arrayBufferToBase64(audioBuffer);
                            
                            // 构建请求参数
                            const requestData = {
                                model: this.model,
                                input: {
                                    format: this.format,
                                    sample_rate: this.sampleRate,
                                    audio: base64Audio
                                }
                            };
                            
                            // 调用DashScope API
                            const response = await fetch(`${self.baseUrl}/api/v1/services/asr/recognition`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${self.apiKey}`
                                },
                                body: JSON.stringify(requestData)
                            });
                            
                            if (!response.ok) {
                                throw new Error(`语音识别API返回错误: ${response.status}`);
                            }
                            
                            const result = await response.json();
                            
                            // 处理识别结果
                            if (this.callback && this.callback.onEvent) {
                                this.callback.onEvent({
                                    sentence: result.output && result.output.text ? result.output.text : '',
                                    get_sentence: function() { return this.sentence; }
                                });
                            }
                        } catch (error) {
                            console.error('发送音频帧失败:', error);
                        }
                    },
                    
                    // 停止识别
                    stop() {
                        this.isRunning = false;
                        if (this.callback && this.callback.onClose) {
                            this.callback.onClose();
                        }
                    },
                    
                    // 将ArrayBuffer转换为Base64
                    _arrayBufferToBase64(buffer) {
                        const bytes = new Uint8Array(buffer);
                        let binary = '';
                        for (let i = 0; i < bytes.byteLength; i++) {
                            binary += String.fromCharCode(bytes[i]);
                        }
                        return btoa(binary);
                    }
                };
            }
        };
    }

    /**
     * 多模态对话API - 用于语音识别等功能
     */
    static MultiModalConversation = {
        /**
         * 调用多模态对话API
         * @param {Object} options - 调用选项
         * @param {string} options.model - 模型名称，如 'qwen-audio-asr'
         * @param {Array} options.messages - 消息数组
         * @param {string} options.result_format - 结果格式，如 'message'
         * @param {boolean} options.stream - 是否使用流式输出，默认为false
         * @returns {Promise<Object|AsyncGenerator>} - API响应或流式响应生成器
         */
        call: async function(options) {
            const { model, messages, result_format, stream = false } = options;
            
            // 构建请求参数
            const requestData = {
                model,
                messages,
                result_format,
                stream
            };
            
            try {
                // 调用API
                const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.dashscopeApiKey || ''}`
                    },
                    body: JSON.stringify(requestData)
                });
                
                if (!response.ok) {
                    throw new Error(`DashScope API返回错误: ${response.status}`);
                }
                
                // 处理流式响应
                if (stream) {
                    return this._handleStreamResponse(response);
                }
                
                return await response.json();
            } catch (error) {
                console.error('DashScope API调用失败:', error);
                throw error;
            }
        },
        
        /**
         * 处理流式响应
         * @param {Response} response - fetch API的响应对象
         * @returns {AsyncGenerator} - 异步生成器，用于逐步获取流式响应
         */
        _handleStreamResponse: async function* (response) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    // 解码二进制数据
                    const chunk = decoder.decode(value, { stream: true });
                    
                    // 处理数据块
                    const lines = chunk.split('\n').filter(line => line.trim() !== '');
                    
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.substring(6);
                            if (data === '[DONE]') continue;
                            
                            try {
                                const parsed = JSON.parse(data);
                                yield parsed;
                            } catch (e) {
                                console.error('解析流式响应失败:', e);
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }
        }
    };
}

// 创建DashScope实例
const dashscope = new DashScope();

// 添加静态方法
dashscope.MultiModalConversation = DashScope.MultiModalConversation;

// 导出DashScope对象
export default dashscope;