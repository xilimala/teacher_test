// API服务模块 - 处理与大模型API的交互
import config from './config.js';

// API服务类
class ApiService {
    constructor() {
        this.qwenConfig = config.qwenApi;
        this.speechToTextConfig = config.speechToTextApi;
        this.textToSpeechConfig = config.textToSpeechApi;
    }

    // 生成面试问题
    async generateInterviewQuestions(params) {
        try {
            const { interviewType, subject, difficulty, includeHotTopics } = params;
            
            // 构建提示词
            const prompt = this._buildQuestionPrompt(interviewType, subject, difficulty, includeHotTopics);
            
            // 调用大模型API
            const response = await this._callLlmApi(prompt);
            
            // 解析响应
            return this._parseQuestionsResponse(response);
        } catch (error) {
            console.error('生成面试问题失败:', error);
            throw new Error('生成面试问题失败，请检查API配置或网络连接');
        }
    }

    // 评价用户回答
    async evaluateAnswer(params) {
        try {
            const { question, userAnswer, interviewType, subject } = params;
            
            // 构建提示词
            const prompt = this._buildEvaluationPrompt(question, userAnswer, interviewType, subject);
            
            // 调用大模型API
            const response = await this._callLlmApi(prompt);
            
            // 解析响应
            return this._parseEvaluationResponse(response);
        } catch (error) {
            console.error('评价回答失败:', error);
            throw new Error('评价回答失败，请检查API配置或网络连接');
        }
    }

    // 语音识别 - 将语音转换为文本
    async speechToText(audioBlob) {
        try {
            // 检查是否使用阿里云ASR服务
            if (this.speechToTextConfig.provider === 'aliyun' || this.speechToTextConfig.provider === 'dashscope') {
                // 将音频Blob转换为Base64
                const base64Audio = await this._blobToBase64(audioBlob);
                
                // 导入DashScope客户端
                const dashscope = await import('./dashscope.js').then(module => {
                    return module.default;
                });
                
                // 构建请求参数
                const requestData = {
                    model: this.speechToTextConfig.model || 'qwen-audio-asr',
                    messages: [
                        {
                            role: "user",
                            content: [
                                {"audio": base64Audio}
                            ]
                        }
                    ],
                    result_format: "message",
                    stream: true // 启用流式输出
                };
                
                try {
                    // 使用DashScope客户端调用API，支持流式输出
                    const streamResponse = await dashscope.MultiModalConversation.call(requestData);
                    
                    // 处理流式响应
                    let fullText = '';
                    
                    // 创建一个自定义事件，用于实时更新识别结果
                    const recognitionProgressEvent = new CustomEvent('recognition-progress');
                    
                    // 逐步处理流式响应
                    for await (const chunk of streamResponse) {
                        try {
                            if (chunk.output && chunk.output.choices && chunk.output.choices.length > 0) {
                                const message = chunk.output.choices[0].message;
                                if (message && message.content && Array.isArray(message.content) && message.content.length > 0) {
                                    for (const item of message.content) {
                                        if (item.text) {
                                            fullText += item.text;
                                            // 触发进度事件，可以在UI层监听此事件来更新显示
                                            document.dispatchEvent(recognitionProgressEvent);
                                        }
                                    }
                                }
                            }
                        } catch (e) {
                            console.error('处理流式响应块失败:', e);
                        }
                    }
                    
                    return fullText || '';
                } catch (error) {
                    console.error('流式语音识别失败:', error);
                    throw error;
                }
            } else if (this.speechToTextConfig.provider === 'paraformer') {
                // 使用Paraformer实时语音识别
                try {
                    // 导入DashScope客户端
                    const dashscope = await import('./dashscope.js').then(module => {
                        return module.default;
                    });
                    
                    // 创建一个Promise来处理实时语音识别
                    return new Promise((resolve, reject) => {
                        let recognizedText = '';
                        
                        // 创建回调处理类
                        class RecognitionCallback {
                            constructor() {
                                this.onTextUpdate = null;
                            }
                            
                            onOpen() {
                                console.log('Paraformer实时语音识别已启动');
                                // 这里可以初始化麦克风等资源
                            }
                            
                            onClose() {
                                console.log('Paraformer实时语音识别已关闭');
                                // 这里可以释放麦克风等资源
                                resolve(recognizedText);
                            }
                            
                            onEvent(result) {
                                // 处理识别结果
                                if (result && result.sentence) {
                                    recognizedText += result.sentence;
                                    
                                    // 触发文本更新事件
                                    if (this.onTextUpdate) {
                                        this.onTextUpdate(recognizedText);
                                    }
                                    
                                    // 创建一个自定义事件，用于实时更新识别结果
                                    const recognitionProgressEvent = new CustomEvent('recognition-progress', {
                                        detail: { text: recognizedText }
                                    });
                                    document.dispatchEvent(recognitionProgressEvent);
                                }
                            }
                        }
                        
                        // 创建回调实例
                        const callback = new RecognitionCallback();
                        
                        // 初始化Paraformer识别器
                        const recognition = dashscope.audio.asr.Recognition.create({
                            model: 'paraformer-realtime-v2',
                            format: 'pcm',
                            sampleRate: 16000,
                            callback: callback
                        });
                        
                        // 开始识别
                        recognition.start();
                        
                        // 处理音频数据
                        // 注意：这里需要将audioBlob转换为适合Paraformer的格式
                        this._processAudioForParaformer(audioBlob, recognition)
                            .then(() => {
                                // 停止识别
                                recognition.stop();
                            })
                            .catch(error => {
                                reject(error);
                            });
                    });
                } catch (error) {
                    console.error('Paraformer实时语音识别失败:', error);
                    throw error;
                }
            } else if (this.speechToTextConfig.provider === 'qwen') {
                // 导入通义千问客户端
                const qwenClient = await import('./qwen.js').then(module => {
                    const client = module.default;
                    client.apiKey = this.speechToTextConfig.apiKey;
                    return client;
                });
                
                // 准备音频消息
                const message = await qwenClient.prepareAudioMessage(audioBlob, "请识别这段语音内容");
                
                // 调用通义千问API
                const stream = await qwenClient.chat({
                    model: this.speechToTextConfig.model,
                    messages: [message],
                    modalities: ["text"],
                    stream: true
                });
                
                // 解析流式响应
                const text = await qwenClient.parseStreamResponse(stream);
                return text || '';
            } else {
                // 原有的API调用逻辑
                // 创建FormData对象
                const formData = new FormData();
                formData.append('audio', audioBlob, 'recording.wav');
                
                // 调用语音识别API
                const response = await fetch(this.speechToTextConfig.endpoint, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.speechToTextConfig.apiKey}`
                    },
                    body: formData
                });
                
                if (!response.ok) {
                    throw new Error(`语音识别API返回错误: ${response.status}`);
                }
                
                const data = await response.json();
                return data.text || '';
            }
        } catch (error) {
            console.error('语音识别失败:', error);
            console.error('语音识别详细信息:', {
                提供商: this.speechToTextConfig.provider,
                模型: this.speechToTextConfig.model,
                音频格式: audioBlob.type,
                音频大小: audioBlob.size + ' 字节'
            });
            throw new Error('语音识别失败，请检查API配置或网络连接');
        }
    }
    
    // 将Blob转换为Base64
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

    // 语音合成 - 将文本转换为语音
    async textToSpeech(text) {
        try {
            // 检查是否使用通义千问CosyVoice服务
            if (this.textToSpeechConfig.provider === 'cosyvoice') {
                // 导入TTS服务
                const ttsService = await import('./tts-service.js').then(module => {
                    const service = module.default;
                    service.apiKey = this.textToSpeechConfig.apiKey;
                    return service;
                });
                
                // 构建合成选项
                const options = {
                    model: this.textToSpeechConfig.model || 'cosyvoice-v1',
                    voice: this.textToSpeechConfig.voice || 'longxiaochun',
                    format: this.textToSpeechConfig.format || 'pcm_22050_16bit'
                };
                
                // 调用CosyVoice API
                return await ttsService.textToSpeech(text, options);
            } else {
                // 原有的API调用逻辑
                // 构建请求参数
                const requestData = {
                    text: text,
                    voice: this.textToSpeechConfig.voice,
                    rate: this.textToSpeechConfig.rate,
                    pitch: this.textToSpeechConfig.pitch
                };
                
                // 调用语音合成API
                const response = await fetch(this.textToSpeechConfig.endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.textToSpeechConfig.apiKey}`
                    },
                    body: JSON.stringify(requestData)
                });
                
                if (!response.ok) {
                    throw new Error(`语音合成API返回错误: ${response.status}`);
                }
                
                // 返回音频Blob
                return await response.blob();
            }
        } catch (error) {
            console.error('语音合成失败:', error);
            throw new Error('语音合成失败，请检查API配置或网络连接');
        }
    }

    // 私有方法：构建问题生成提示词
    _buildQuestionPrompt(interviewType, subject, difficulty, includeHotTopics) {
        let prompt = `请生成5个${difficulty === 'easy' ? '简单' : difficulty === 'medium' ? '中等' : '困难'}难度的`;
        
        // 添加面试类型
        if (interviewType === 'teacher-qualification') {
            prompt += '教师资格证面试';
        } else {
            prompt += '教师编制招聘面试';
        }
        
        // 添加学科
        const subjectMap = {
            'chinese': '语文',
            'math': '数学',
            'english': '英语',
            'physics': '物理',
            'chemistry': '化学',
            'biology': '生物',
            'history': '历史',
            'geography': '地理',
            'politics': '政治',
            'music': '音乐',
            'art': '美术',
            'pe': '体育',
            'primary': '小学教育',
            'kindergarten': '幼儿教育'
        };
        
        prompt += `${subjectMap[subject] || subject}学科的结构化面试问题`;
        
        // 添加结构化面试题目类型
        prompt += '，请确保生成的问题涵盖以下七大类结构化面试题型：\n';
        prompt += '1. 自我认知类：考察与教师岗位的匹配度，包括职业动机、优势与不足、职业规划等；\n';
        prompt += '2. 人际沟通类：涉及与家长、同事、学生等关系的处理；\n';
        prompt += '3. 组织管理类：侧重活动策划与执行，如班会、春游、家长会等场景的组织协调；\n';
        prompt += '4. 应急应变类：针对突发事件的处理能力，例如学生受伤、课堂突发状况等；\n';
        prompt += '5. 综合分析类：分析教育现象、政策或名言；\n';
        prompt += '6. 教育教学类：解决教学中的实际问题，如学生偏科、作业管理、课堂纪律等；\n';
        prompt += '7. 时事政治类：结合教育相关的政策或会议精神，考察对教育方针的理解';
        
        // 添加热点话题要求
        if (includeHotTopics) {
            prompt += '，并请包含最新的教育热点话题';
        }
        
        prompt += '。对于每个问题，请同时提供一个参考答案。返回格式为JSON数组，每个元素包含question、reference和type字段，其中type表示问题类型（1-7对应上述七种类型）。';
        
        return prompt;
    }

    // 私有方法：构建评价提示词
    _buildEvaluationPrompt(question, userAnswer, interviewType, subject) {
        let prompt = `你是一位经验丰富的教师面试考官，请对以下${interviewType === 'teacher-qualification' ? '教师资格证' : '教师编制招聘'}面试中的回答进行评价。\n\n`;
        
        prompt += `面试问题：${question}\n\n`;
        prompt += `考生回答：${userAnswer}\n\n`;
        prompt += '请从专业性、逻辑性、表达能力、理论结合实践等方面进行评价，给出1-100的分数，并提供详细的评价意见。\n\n';
        prompt += '请严格按照以下JSON格式返回评价结果，不要包含任何其他文本：\n';
        prompt += '{\n  "score": 分数（1-100的整数）,\n  "evaluation": "详细的评价意见"\n}';

        
        return prompt;
    }

    // 私有方法：调用大模型API
    async _callLlmApi(prompt) {
        // 导入通义千问客户端
        const qwenClient = await import('./qwen.js').then(module => {
            const client = module.default;
            client.apiKey = this.qwenConfig.apiKey;
            return client;
        });

        // 构建请求参数
        const options = {
            model: this.qwenConfig.model,
            messages: [
                {
                    role: "user",
                    content: prompt
                }
            ],
            modalities: ["text"],
            stream: true // 使用流式输出以获取更可靠的响应
        };

        try {
            // 调用通义千问API
            const stream = await qwenClient.chat(options);
            // 解析流式响应
            const responseText = await qwenClient.parseStreamResponse(stream);
            
            // 构造与非流式响应格式兼容的对象
            return {
                choices: [
                    {
                        message: {
                            content: responseText
                        }
                    }
                ]
            };
        } catch (error) {
            console.error('通义千问API调用失败:', error);
            throw error;
        }
    }

    // 私有方法：解析问题响应
    _parseQuestionsResponse(response) {
        try {
            // 根据API返回格式进行调整
            let questions;
            let content = '';
            
            // 处理不同格式的响应
            if (response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) {
                // 标准API格式的响应
                content = response.choices[0].message.content;
            } else if (response.result) {
                // 自定义格式的响应
                questions = response.result;
            } else if (Array.isArray(response)) {
                // 直接返回数组
                questions = response;
            } else if (typeof response === 'string') {
                // 如果直接返回字符串
                content = response;
            } else {
                console.error('未知的响应格式:', response);
                throw new Error('无法解析API响应');
            }
            
            // 如果有内容字符串，尝试解析JSON
            if (content && !questions) {
                // 尝试直接解析
                try {
                    questions = JSON.parse(content);
                } catch (e) {
                    console.log('直接解析JSON失败，尝试提取JSON部分');
                    // 尝试提取JSON数组
                    const arrayMatch = content.match(/\[\s*\{[\s\S]*?\}\s*\]/g);
                    if (arrayMatch && arrayMatch.length > 0) {
                        try {
                            questions = JSON.parse(arrayMatch[0]);
                        } catch (e2) {
                            console.error('提取JSON数组失败:', e2);
                        }
                    }
                    
                    // 如果数组提取失败，尝试使用更宽松的正则表达式
                    if (!questions) {
                        const jsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/s);
                        if (jsonMatch) {
                            try {
                                // 清理可能的非法JSON字符
                                let cleanJson = jsonMatch[0].replace(/\\n/g, '\n').replace(/\\r/g, '');
                                questions = JSON.parse(cleanJson);
                            } catch (e3) {
                                console.error('清理后解析JSON失败:', e3);
                                // 最后尝试手动解析
                                questions = this._manualParseQuestions(content);
                            }
                        } else {
                            // 尝试手动解析
                            questions = this._manualParseQuestions(content);
                        }
                    }
                }
            }
            
            // 验证问题格式
            if (!questions || !Array.isArray(questions) || questions.length === 0) {
                console.error('无法获取有效的问题数组:', questions);
                throw new Error('API返回的问题格式不正确');
            }
            
            // 标准化问题格式
            return questions.map(q => ({
                question: q.question || '',
                reference: q.reference || '',
                type: parseInt(q.type) || 0 // 确保类型是数字
            }));
        } catch (error) {
            console.error('解析问题响应失败:', error);
            throw new Error('解析问题响应失败');
        }
    }
    
    // 辅助方法：手动解析问题文本
    _manualParseQuestions(text) {
        console.log('尝试手动解析问题文本');
        const questions = [];
        
        // 尝试识别问题和参考答案的模式
        const questionBlocks = text.split(/\d+\.\s*/).filter(block => block.trim().length > 0);
        
        for (let i = 0; i < questionBlocks.length; i++) {
            const block = questionBlocks[i];
            // 尝试分离问题和参考答案
            const parts = block.split(/参考答案[：:]/i);
            
            if (parts.length >= 2) {
                const questionText = parts[0].trim();
                const referenceText = parts.slice(1).join('参考答案:').trim();
                
                // 尝试确定问题类型
                let type = 0;
                if (questionText.includes('自我认知') || questionText.includes('职业规划') || questionText.includes('为什么选择')) {
                    type = 1; // 自我认知类
                } else if (questionText.includes('沟通') || questionText.includes('家长') || questionText.includes('同事')) {
                    type = 2; // 人际沟通类
                } else if (questionText.includes('组织') || questionText.includes('活动') || questionText.includes('管理')) {
                    type = 3; // 组织管理类
                } else if (questionText.includes('突发') || questionText.includes('应急') || questionText.includes('处理')) {
                    type = 4; // 应急应变类
                } else if (questionText.includes('分析') || questionText.includes('理解') || questionText.includes('看法')) {
                    type = 5; // 综合分析类
                } else if (questionText.includes('教学') || questionText.includes('课堂') || questionText.includes('学生')) {
                    type = 6; // 教育教学类
                } else if (questionText.includes('政策') || questionText.includes('时事') || questionText.includes('热点')) {
                    type = 7; // 时事政治类
                }
                
                questions.push({
                    question: questionText,
                    reference: referenceText,
                    type: type
                });
            }
        }
        
        // 如果没有找到问题，尝试其他格式
        if (questions.length === 0) {
            // 尝试查找问题和答案的模式
            const questionMatches = text.match(/问题[\d\s]*[:：]\s*([^\n]+)/g);
            const answerMatches = text.match(/(?:参考)?答案[\d\s]*[:：]\s*([^\n]+)/g);
            
            if (questionMatches && answerMatches && questionMatches.length === answerMatches.length) {
                for (let i = 0; i < questionMatches.length; i++) {
                    const questionText = questionMatches[i].replace(/问题[\d\s]*[:：]\s*/, '').trim();
                    const referenceText = answerMatches[i].replace(/(?:参考)?答案[\d\s]*[:：]\s*/, '').trim();
                    
                    questions.push({
                        question: questionText,
                        reference: referenceText,
                        type: 0 // 默认类型
                    });
                }
            }
        }
        
        return questions.length > 0 ? questions : null;
    }
    }

    // 私有方法：解析评价响应
    _parseEvaluationResponse(response) 
    {
        try {
            // 根据ARK API返回格式进行调整
            let evaluation = null;
            
            if (response.choices && response.choices[0] && response.choices[0].message && response.choices[0].message.content) {
                // ARK API格式的响应
                const content = response.choices[0].message.content;
                // 尝试解析JSON内容
                try {
                    evaluation = JSON.parse(content);
                } catch (e) {
                    console.log('直接解析JSON失败，尝试提取JSON部分');
                    // 如果不是有效的JSON，尝试从文本中提取JSON
                    // 使用更宽松的正则表达式匹配包含score和evaluation的JSON对象
                    const jsonMatch = content.match(/\{[\s\S]*?"score"[\s\S]*?"evaluation"[\s\S]*?\}/s) || 
                                      content.match(/\{[\s\S]*?score[\s\S]*?evaluation[\s\S]*?\}/s);
                    if (jsonMatch) {
                        try {
                            // 清理可能的非法JSON字符
                            let cleanJson = jsonMatch[0].replace(/\\n/g, '\n').replace(/\\r/g, '');
                            evaluation = JSON.parse(cleanJson);
                        } catch (e2) {
                            console.error('清理后解析JSON失败:', e2);
                            // 尝试手动提取评分和评价
                            const scoreMatch = content.match(/"?score"?\s*[=:]\s*([0-9]+)/i);
                            const evaluationMatch = content.match(/"?evaluation"?\s*[=:]\s*"([^"]+)"/i);
                            
                            if (scoreMatch && evaluationMatch) {
                                evaluation = {
                                    score: parseInt(scoreMatch[1]),
                                    evaluation: evaluationMatch[1]
                                };
                            }
                        }
                    }
                }
            } else if (response.result) {
                // 如果是自定义格式的响应
                evaluation = response.result;
            } else if (response.score !== undefined && response.evaluation !== undefined) {
                // 如果直接返回对象
                evaluation = response;
            } else if (typeof response === 'string') {
                // 如果直接返回字符串，尝试解析
                try {
                    evaluation = JSON.parse(response);
                } catch (e) {
                    console.error('解析字符串响应失败:', e);
                }
            }
            
            // 如果仍然无法获取评价，创建一个默认评价
            if (!evaluation) {
                console.warn('无法解析API响应，使用默认评价');
                evaluation = {
                    score: 70,
                    evaluation: '系统无法解析评价结果，请重试或联系管理员。'
                };
            }
            
            // 确保评价对象包含必要的字段
            return {
                score: evaluation.score !== undefined ? parseInt(evaluation.score) || 0 : 0,
                evaluation: evaluation.evaluation || ''
            };
        } catch (error) {
            console.error('解析评价响应失败:', error);
            // 返回默认评价而不是抛出异常，提高系统健壮性
            return {
                score: 70,
                evaluation: '系统处理评价时遇到错误，请重试或联系管理员。'
            };
        }
    }


// 导出API服务实例
const apiService = new ApiService();
export default apiService;