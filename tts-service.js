/**
 * 通义千问CosyVoice语音合成服务
 * 用于调用阿里云的CosyVoice模型进行语音合成
 */

class TtsService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/v2';
        this.audioContext = null;
        this.audioQueue = [];
        this.isPlaying = false;
        this.initAudioContext();
    }

    /**
     * 初始化Web Audio API上下文
     */
    initAudioContext() {
        try {
            // 创建AudioContext
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();
            console.log('AudioContext初始化成功');
        } catch (error) {
            console.error('AudioContext初始化失败:', error);
        }
    }

    /**
     * 文本转语音 - 流式合成
     * @param {string} text - 要合成的文本
     * @param {Object} options - 合成选项
     * @returns {Promise<void>} - 合成完成的Promise
     */
    async streamingTts(text, options = {}) {
        if (!text || text.trim() === '') {
            console.warn('文本为空，跳过语音合成');
            return;
        }

        try {
            // 确保AudioContext已初始化
            if (!this.audioContext) {
                this.initAudioContext();
            }

            // 如果AudioContext被暂停（浏览器策略），则恢复
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // 构建请求参数
            const requestData = {
                model: options.model || 'cosyvoice-v1',
                voice: options.voice || 'longxiaochun',
                format: options.format || 'pcm_22050_16bit',
                text: text
            };

            // 发起请求
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'X-DashScope-Streaming': 'enable'
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error(`语音合成API返回错误: ${response.status}`);
            }

            // 处理流式响应
            const reader = response.body.getReader();
            let receivedLength = 0;
            let chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                receivedLength += value.length;

                // 处理音频块
                await this.processAudioChunk(value);
            }

            console.log(`语音合成完成，共接收 ${receivedLength} 字节的音频数据`);
        } catch (error) {
            console.error('语音合成失败:', error);
            throw error;
        }
    }

    /**
     * 处理音频数据块
     * @param {Uint8Array} chunk - 音频数据块
     * @returns {Promise<void>}
     */
    async processAudioChunk(chunk) {
        try {
            // 将PCM数据转换为AudioBuffer
            const audioBuffer = await this.decodeAudioData(chunk);
            
            // 将AudioBuffer添加到播放队列
            this.audioQueue.push(audioBuffer);
            
            // 如果当前没有播放，则开始播放
            if (!this.isPlaying) {
                this.playNextInQueue();
            }
        } catch (error) {
            console.error('处理音频块失败:', error);
        }
    }

    /**
     * 将PCM数据解码为AudioBuffer
     * @param {Uint8Array} pcmData - PCM格式的音频数据
     * @returns {Promise<AudioBuffer>} - 解码后的AudioBuffer
     */
    async decodeAudioData(pcmData) {
        try {
            // 将PCM数据转换为16位整数数组
            const pcmBuffer = new Int16Array(pcmData.buffer);
            
            // 创建AudioBuffer (单声道, 22050Hz采样率)
            const numChannels = 1;
            const sampleRate = 22050;
            const audioBuffer = this.audioContext.createBuffer(numChannels, pcmBuffer.length, sampleRate);
            
            // 填充AudioBuffer
            const channelData = audioBuffer.getChannelData(0);
            for (let i = 0; i < pcmBuffer.length; i++) {
                // 将16位整数转换为-1.0到1.0之间的浮点数
                channelData[i] = pcmBuffer[i] / 32768.0;
            }
            
            return audioBuffer;
        } catch (error) {
            console.error('解码音频数据失败:', error);
            throw error;
        }
    }

    /**
     * 播放队列中的下一个音频
     */
    playNextInQueue() {
        if (this.audioQueue.length === 0) {
            this.isPlaying = false;
            return;
        }
        
        this.isPlaying = true;
        const audioBuffer = this.audioQueue.shift();
        
        // 创建音频源
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);
        
        // 播放完成后播放下一个
        source.onended = () => {
            this.playNextInQueue();
        };
        
        // 开始播放
        source.start();
    }

    /**
     * 停止所有音频播放
     */
    stopPlayback() {
        this.audioQueue = [];
        this.isPlaying = false;
    }

    /**
     * 文本转语音 - 非流式（一次性返回完整音频）
     * @param {string} text - 要合成的文本
     * @param {Object} options - 合成选项
     * @returns {Promise<Blob>} - 音频Blob对象
     */
    async textToSpeech(text, options = {}) {
        try {
            // 构建请求参数
            const requestData = {
                model: options.model || 'cosyvoice-v1',
                voice: options.voice || 'longxiaochun',
                format: options.format || 'pcm_22050_16bit',
                text: text
            };
            
            // 调用API
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestData)
            });
            
            if (!response.ok) {
                throw new Error(`语音合成API返回错误: ${response.status}`);
            }
            
            // 返回音频Blob
            return await response.blob();
        } catch (error) {
            console.error('语音合成失败:', error);
            throw error;
        }
    }
}

// 导出TtsService对象
const ttsService = new TtsService();

export default ttsService;