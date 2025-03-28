/**
 * Paraformer实时语音识别客户端
 * 用于调用阿里云的Paraformer实时语音识别服务
 */

class ParaformerClient {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.recognition = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.audioInput = null;
        this.processor = null;
        this.isRecording = false;
    }

    /**
     * 初始化音频上下文和处理器
     */
    async initAudioContext() {
        try {
            // 创建音频上下文
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // 请求麦克风权限
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 16000
                }
            });
            
            // 创建音频输入节点
            this.audioInput = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // 创建处理器节点
            this.processor = this.audioContext.createScriptProcessor(3200, 1, 1);
            
            // 连接节点
            this.audioInput.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            
            console.log('音频上下文初始化成功');
        } catch (error) {
            console.error('初始化音频上下文失败:', error);
            throw error;
        }
    }

    /**
     * 开始实时语音识别
     * @param {Function} onResult - 识别结果回调函数
     */
    async startRecognition(onResult) {
        if (this.isRecording) {
            console.warn('语音识别已经在运行中');
            return;
        }
        
        try {
            // 初始化音频上下文
            if (!this.audioContext) {
                await this.initAudioContext();
            }
            
            // 创建识别实例
            this.recognition = new Recognition({
                model: 'paraformer-realtime-v2',
                format: 'pcm',
                sampleRate: 16000,
                apiKey: this.apiKey,
                onOpen: () => {
                    console.log('语音识别服务已连接');
                    this.isRecording = true;
                },
                onClose: () => {
                    console.log('语音识别服务已断开');
                    this.isRecording = false;
                },
                onError: (error) => {
                    console.error('语音识别错误:', error);
                    this.stopRecognition();
                },
                onResult: (result) => {
                    if (result && result.sentence) {
                        onResult(result.sentence);
                    }
                }
            });
            
            // 开始识别
            this.recognition.start();
            
            // 处理音频数据
            this.processor.onaudioprocess = (e) => {
                if (this.isRecording) {
                    // 获取音频数据
                    const inputData = e.inputBuffer.getChannelData(0);
                    
                    // 将Float32Array转换为Int16Array
                    const pcmData = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        pcmData[i] = inputData[i] * 0x7FFF;
                    }
                    
                    // 发送音频帧
                    this.recognition.sendAudioFrame(pcmData.buffer);
                }
            };
        } catch (error) {
            console.error('启动语音识别失败:', error);
            throw error;
        }
    }

    /**
     * 停止实时语音识别
     */
    stopRecognition() {
        if (!this.isRecording) {
            return;
        }
        
        try {
            // 停止识别
            if (this.recognition) {
                this.recognition.stop();
                this.recognition = null;
            }
            
            // 断开音频处理
            if (this.processor) {
                this.processor.disconnect();
                this.audioInput.disconnect();
            }
            
            // 停止媒体流
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
                this.mediaStream = null;
            }
            
            // 关闭音频上下文
            if (this.audioContext) {
                this.audioContext.close();
                this.audioContext = null;
            }
            
            this.isRecording = false;
            console.log('语音识别已停止');
        } catch (error) {
            console.error('停止语音识别失败:', error);
            throw error;
        }
    }
}

/**
 * Recognition类 - 封装与Paraformer服务的WebSocket通信
 */
class Recognition {
    constructor(options) {
        this.options = options;
        this.ws = null;
    }

    /**
     * 开始识别
     */
    start() {
        // 创建WebSocket连接
        this.ws = new WebSocket('wss://dashscope.aliyuncs.com/api/v1/services/asr/paraformer-realtime');
        
        // 设置事件处理器
        this.ws.onopen = () => {
            // 发送配置信息
            this.ws.send(JSON.stringify({
                model: this.options.model,
                format: this.options.format,
                sample_rate: this.options.sampleRate,
                api_key: this.options.apiKey
            }));
            
            if (this.options.onOpen) {
                this.options.onOpen();
            }
        };
        
        this.ws.onmessage = (event) => {
            try {
                const result = JSON.parse(event.data);
                if (this.options.onResult) {
                    this.options.onResult(result);
                }
            } catch (error) {
                console.error('解析识别结果失败:', error);
            }
        };
        
        this.ws.onerror = (error) => {
            if (this.options.onError) {
                this.options.onError(error);
            }
        };
        
        this.ws.onclose = () => {
            if (this.options.onClose) {
                this.options.onClose();
            }
        };
    }

    /**
     * 发送音频帧
     * @param {ArrayBuffer} audioData - PCM音频数据
     */
    sendAudioFrame(audioData) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(audioData);
        }
    }

    /**
     * 停止识别
     */
    stop() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

// 导出ParaformerClient
const paraformerClient = new ParaformerClient();
export default paraformerClient;