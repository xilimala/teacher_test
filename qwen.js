/**
 * 通义千问API客户端
 * 用于调用阿里云的通义千问API服务，支持音频+文本输入能力
 */

class QwenClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    }

    /**
     * 调用通义千问模型API
     * @param {Object} options - 调用选项
     * @param {string} options.model - 模型名称，如 'qwen-omni-turbo'
     * @param {Array} options.messages - 消息数组
     * @param {Array} options.modalities - 输出数据的模态，当前支持["text"]
     * @param {boolean} options.stream - 是否使用流式输出，必须设置为true
     * @returns {Promise<Object>} - API响应
     */
    async chat(options) {
        const { model, messages, modalities = ["text"], stream = true } = options;
        
        // 构建请求参数
        const requestData = {
            model,
            messages,
            modalities,
            stream,
            stream_options: { include_usage: true }
        };
        
        try {
            // 调用API
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestData)
            });
            
            if (!response.ok) {
                throw new Error(`通义千问API返回错误: ${response.status}`);
            }
            
            // 处理流式响应
            if (stream) {
                return response.body;
            } else {
                return await response.json();
            }
        } catch (error) {
            console.error('通义千问API调用失败:', error);
            throw error;
        }
    }

    /**
     * 将音频转换为通义千问API可接受的格式
     * @param {Blob} audioBlob - 音频Blob对象
     * @param {string} text - 可选的文本提示
     * @returns {Promise<Object>} - 格式化的消息对象
     */
    async prepareAudioMessage(audioBlob, text = '') {
        // 将音频Blob转换为Base64
        const base64Audio = await this._blobToBase64(audioBlob);
        
        // 构建消息内容
        const content = [];
        
        // 获取音频格式，确保使用通义千问API支持的格式
        // 通义千问支持的格式：wav, mp3, m4a, pcm
        let format = 'wav';
        if (audioBlob.type) {
            const mimeFormat = audioBlob.type.split('/')[1];
            // 检查是否为支持的格式
            if (['wav', 'mp3', 'm4a', 'pcm'].includes(mimeFormat)) {
                format = mimeFormat;
            }
            // webm格式需要特殊处理，API只支持wav, mp3, m4a, pcm格式
            if (mimeFormat === 'webm' || !['wav', 'mp3', 'm4a', 'pcm'].includes(mimeFormat)) {
                console.log('检测到不支持的音频格式，将使用wav格式');
                format = 'wav';
            }
        }
        
        console.log(`准备音频消息，格式: ${format}, 大小: ${audioBlob.size} 字节`);
        
        // 添加音频内容
        content.push({
            type: "input_audio",
            input_audio: {
                data: base64Audio,
                format: format
            }
        });
        
        // 如果有文本，添加文本内容
        if (text) {
            content.push({
                type: "text",
                text: text
            });
        }
        
        return {
            role: "user",
            content: content
        };
    }
    
    /**
     * 将Blob转换为Base64
     * @param {Blob} blob - 音频Blob对象
     * @returns {Promise<string>} - Base64编码的字符串
     */
    async _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                // 获取base64字符串，去掉前缀（如data:audio/wav;base64,）
                const base64String = reader.result.split(',')[1];
                resolve(base64String);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * 解析通义千问API的流式响应
     * @param {ReadableStream} stream - 流式响应
     * @returns {Promise<string>} - 解析后的文本
     */
    async parseStreamResponse(stream) {
        const reader = stream.getReader();
        let result = '';
        
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                // 将Uint8Array转换为字符串
                const chunk = new TextDecoder().decode(value);
                
                // 处理每个数据块
                const lines = chunk.split('\n').filter(line => line.trim() !== '');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.substring(6);
                        if (data === '[DONE]') continue;
                        
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                                const delta = parsed.choices[0].delta;
                                if (delta.content) {
                                    result += delta.content;
                                }
                            }
                        } catch (e) {
                            console.error('解析流式响应失败:', e);
                        }
                    }
                }
            }
            
            return result;
        } finally {
            reader.releaseLock();
        }
    }
}

// 导出QwenClient对象
const qwenClient = new QwenClient();

export default qwenClient;