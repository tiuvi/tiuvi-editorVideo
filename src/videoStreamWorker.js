'use strict';



/*

    18:30
    Itinerario

    funcionalidad

        Falta añadir editSecondary con argumentos para el segundo video
        
        HECHO - Grabar audio
        HECHO - extraer audio
        HECHO - extraer video
        Añadir mediapipe y background remove
        HECHO - Combinar videos
        Imagenes to video
        video to imagenes
        Añadir enviar el canvas desde createWorker, para que el usuario pueda ver
        los cambios que se hacen en createworker

        Una funcion que obtenga los frames de cualquier video y los pueda enviar.

        edition
        Agrupar todo lo que sea de videoframe en un objeto
        Agrupoar todo lo qe sea de secondary videoframe en otro objeto

        Añadir script de ia compatible con worker donde se edita el frame.
        Añadir funcion de iniciar la grabacion cuando se quiera y de parar la grabacion.


        HECHO - soporte para archivos webm
        HECHO - opcion de salida de webm o mp4

                Añadir para reducir el uso de memoria del muxer
                https://developer.mozilla.org/en-US/docs/Web/API/File_System_API

    stream
        HECHO - Soporte para getusermedia videocamara
        Probar constrain en stream de videos a ver si funciona
        ERROR - Probar si se puede parar el video varias veces para no acumular memoria.

    captureScreen
        HECHO - Añadir soporte para capture screen

    errores
        HECHO - La salida del archivo de stream es mas larga porque el ultimo frames es mas largo que el
        HECHO - ultimo frame de audio ajustar el tiempo
        HECHO - Ajustes de tiempo para grabaciones tanto de audio como de video, como para la segunda  grabacion
        Gestionar el error cuando la velocidad de procesamiento es muy rapida

        Revisar que ocurre cuando es un audio y cuando es un video sin sonido

        Capturar errores si se esta en navegadores incompatibles.



*/

globalThis["tiuviVideoEditor"] = {};
globalThis["tiuviVideoEditor"].nameGlobal = "tiuviVideoEditor";
//Si debug es true los errores se lanzan de manera normal.
globalThis["tiuviVideoEditor"].debug = false;
globalThis["tiuviVideoEditor"]['isWorker'] = typeof window === 'undefined';



globalThis["tiuviVideoEditor"]["onErrorHandle"] = function (error, userDeviceInfo, onMessage) {

    let newError;
    if (error instanceof Error) {

        newError = error;

    } else {

        newError = new Error(error);
    }

    newError.userDeviceInfo = userDeviceInfo;

    if (globalThis["tiuviVideoEditor"].debug) {

        onMessage && onMessage({ err: newError });
        throw newError;

    } else {

        onMessage && onMessage({ err: newError });

        return ({ err: newError });
    }

}

globalThis["tiuviVideoEditor"]["onInfoHandle"] = function (message, onMessage) {

    onMessage && onMessage({ info: message });

}


globalThis['load$TiuviVideoEditor'] = async function (options = {}) {

    const { nameGlobal, isWorker } = globalThis["tiuviVideoEditor"];


    const {
        importsUrl = [],
        importsUrlSecond = [],

        //Este evento envia mensajes de tiempo y error
        onMessage = isWorker ? self.postMessage : (message) => { },
        //Este evento necesita un media element para activar el worker que ya esta listo.
        onStreamReady = isWorker ? () => self.postMessage({ streamReady: true }) : () => { },
        onStreamEnd = isWorker ? () => self.postMessage({ streamEnd: true }) : () => { },

        updateTimeProccess,
        onError,
        onInfo,

    } = options;

    function onErrorMessage(userDeviceInfo, error) {

        if (onError) {
            globalThis["tiuviVideoEditor"]["onErrorHandle"](error, userDeviceInfo, onMessage);
        }

    };

    function onInfoMessage(message) {

        if (onInfo) {
            globalThis["tiuviVideoEditor"]["onInfoHandle"](message, onMessage);
        }
    }

    if (isWorker) {

        try {

            importScripts(
                //desmultiplexacion
                'https://cell1.tiuvi.com:1030/mp4box.js',
                'https://cell1.tiuvi.com:1030/webmDemuxer.js',

                //Multiplexacion
                'https://cell1.tiuvi.com:1030/mp4muxer.js',
                'https://cell1.tiuvi.com:1030/webm-multiplexer.js',
                'https://cell1.tiuvi.com:1030/externals/bowser.js',
                ...importsUrl
            );

            if (importsUrlSecond.length !== 0) {
                importScripts(importsUrlSecond);
            }


        } catch (error) {

            return ({ err: error });
        }

    } else {

        try {

            const scripts = [
                // Desmultiplexación
                'https://cell1.tiuvi.com:1030/mp4box.js',
                'https://cell1.tiuvi.com:1030/webmDemuxer.js',
                // Multiplexación
                'https://cell1.tiuvi.com:1030/mp4muxer.js',
                'https://cell1.tiuvi.com:1030/webm-multiplexer.js',
                'https://cell1.tiuvi.com:1030/externals/bowser.js',
                ...importsUrl
            ];

            await Promise.all(scripts.map(src => import(src)));

            if (importsUrlSecond.length !== 0) {

                await Promise.all(importsUrlSecond.map(src => import(src)));
            }

        } catch (error) {
            return ({ err: error });
        }

    }

    const { newCanvas, editVideo } = globalThis["tiuviVideoEditor"];



    function getExtension(type) {

        const mimeTypes = {
            'video/mp4': 'mp4',
            'video/webm': 'webm',
        };

        // Convertir la extensión a minúsculas para asegurar que coincida correctamente
        const typeLower = type.toLowerCase();

        if (typeLower in mimeTypes) {
            return (mimeTypes[typeLower])
        }

        // Devolver un valor predeterminado si no se encuentra una coincidencia
        return 'octet-stream'; // Tipo MIME genérico para archivos binarios
    }

    async function getFileInfo(url) {
        try {
            const response = await fetch(url, { method: 'GET' });
            const contentLength = response.headers.get('content-length');
            const contentType = response.headers.get('content-type');
            const sizeInBytes = contentLength ? parseInt(contentLength, 10) : null;

            if (sizeInBytes !== null && contentType) {

                return { size: sizeInBytes, extension: getExtension(contentType), type: contentType, err: null };
            } else {
                return { size: sizeInBytes, type: contentType, err: 'Content-Length or Content-Type header is not available.' };
            }
        } catch (error) {

            return { size: null, type: null, err: `Error fetching video info: ${error.message}` };
        }
    }

    async function createMediaStream(urlBlob) {

        try {

            // Crear un elemento de video
            const mediaElement = document.createElement('video');

            mediaElement.crossOrigin = "anonymous";
            if (urlBlob instanceof MediaStream) {

                mediaElement.srcObject = urlBlob;

            } else {
                mediaElement.src = urlBlob;
            }

            //Bajamos el volumen para operaciones decaptura;
            mediaElement.volume = 0.001;

            if (mediaElement.readyState < 2) {

                // Esperar hasta que el elemento de video esté listo
                const { err } = await new Promise((resolve) => {

                    let countIntent = 0;
                    const checkReadyState = () => {

                        countIntent++

                        if (mediaElement.readyState >= 2) {
                            resolve({ err: null });
                            clearInterval(intervalId);

                        }

                        if (countIntent > 200) {
                            resolve({ err: "No se puede obtener metadatos si no se interactua con la pagina o el video no es compatible." })
                            clearInterval(intervalId);
                        }

                    };

                    const intervalId = setInterval(checkReadyState, 100);

                });
                if (err !== null) {
                    return ({ err })
                }

            }

            const mediaStream = mediaElement.captureStream()

            return ({
                mediaElement: mediaElement,
                mediaStream,
                err: null,
            });

        } catch (error) {
            return ({ err: error })
        }
    }

    async function getAudioInfo(urlBlob) {


        const {
            mediaElement: mediaElementTemp,
            mediaStream: mediaStreamTemp,
            err,
        } = await createMediaStream(urlBlob);
        if (err !== null) {
            return ({ err });
        }

        const audioTrackTemp = mediaStreamTemp.getAudioTracks()[0];

        const audioTrackProcessorTemp = new MediaStreamTrackProcessor(audioTrackTemp);

        return (async () => {

            let countIntent = 0
            async function canPlay() {
                countIntent++
                try {

                    await mediaElementTemp.play();

                    clearInterval(interval); // Detener el setInterval una vez que se inicie la reproducción
                } catch (error) {
                    if (countIntent > 200) {
                        return { err: "No se puede obtener metadatos si no se interactua con la pagina o el video no es compatible." }
                    }
                }
            }

            var interval = setInterval(canPlay, 500);

            const reader = audioTrackProcessorTemp.readable.getReader();

            while (true) {

                const { value: frame, done } = await reader.read();

                const dataAudio = {
                    numberOfFrames: frame.numberOfFrames,
                    numberOfChannels: frame.numberOfChannels,
                    sampleRate: frame.sampleRate
                }

                mediaElementTemp.pause();

                reader.cancel();

                mediaElementTemp.remove();

                return ({ ...dataAudio, err: null });
            }



        })()

    }


    function getVideoInfo(mediaElement) {

        return {
            width: mediaElement.videoWidth,
            height: mediaElement.videoHeight,
            numberOfPixels: mediaElement.videoWidth * mediaElement.videoHeight,
            aspectRatio: mediaElement.videoWidth / mediaElement.videoHeight,
        }
    }

    /*
        240p: 426x240 píxeles
        360p: 640x360 píxeles
        480p (SD):  píxeles
        720p (HD): 1280x720 píxeles
        1080p (Full HD): 1920x1080 píxeles
        1440p (Quad HD): 2560x1440 píxeles
        4K (Ultra HD): 3840x2160 píxeles
        8K (Full Ultra HD): 7680x4320 píxeles

        1080p 	1920 * 1080	 4000000 (1 min = 34mb ) 30840 videos en un tb
        720p 	1280 * 720	 2500000 (1 min = 22mb ) 47662 videos en un tb
        480p	854 * 480	 1250000 (1 min = 11.6mb ) 90394 videos en un tb
        360p	640 * 360	  500000 (1 min =  5mb ) 209715 videos en un tb 
    */
    function getVideoBitrateAprox(numberOfPixels) {

        return (4000000 * ((numberOfPixels) / (1920 * 1080)))
    }
    /*
        Falta probar constrain en mediaStream a ver si afecta a la grabacion.
    */
    globalThis[nameGlobal]['getMetaDataBigFile'] = async function ({ fileName = "tiuviFile", urlBlob }) {

        const { parsedResult: userDeviceInfo } = bowser.getParser(window.navigator.userAgent);

        var { mediaElement, mediaStream, err } = await createMediaStream(urlBlob);

        if (err !== null) {
            return (globalThis["tiuviVideoEditor"]["onErrorHandle"](err, userDeviceInfo));
        }

        const audio = mediaStream.getAudioTracks().length !== 0;

        const video = mediaStream.getVideoTracks().length !== 0;


        var { numberOfFrames, numberOfChannels, sampleRate, err = null } = audio ? await getAudioInfo(urlBlob) : {};
        if (err !== null) {
            return ({ err })
        }

        var { width = 0, height = 0, numberOfPixels = 0, aspectRatio = 0, err = null } = video ? getVideoInfo(mediaElement) : {};
        if (err !== null) {
            return ({ err })
        }



        let size, type, extension, durationMs, bitrate;
        if (urlBlob instanceof MediaStream) {

            size = null;
            durationMs = Infinity;
            type = 'application/octet-stream';
            extension = null;
            bitrate = getVideoBitrateAprox(numberOfPixels);

        } else {

            ({ size, type, extension, err } = await getFileInfo(urlBlob));
            if (err !== null) {
                return ({ err })
            }

            durationMs = Math.round(mediaElement.duration * 1000);

            bitrate = Math.trunc((size * 8) / (durationMs / 1000));

        }

        const metadata = {
            //Datos en jaascript
            urlBlob: urlBlob instanceof MediaStream ? null : urlBlob,
            mediaElement,
            mediaStream,

            //Datos de video o audio
            fileName,
            durationMs,
            type,
            extension,

            //Datos de archivo
            size,
            bitrate,

            //Datos de archivos de audio
            audio,
            numberOfFrames,
            numberOfChannels,
            sampleRate,

            //Datos de video
            video,
            width,
            height,
            newWidth: width,
            newHeight: height,
            numberOfPixels,
            aspectRatio,

            //Devolucion de error nulo
            userDeviceInfo,
            stopMedia: () => {
                mediaElement.pause();
                mediaStream.getTracks().forEach(track => { track.stop() });
            },
            err: null,
        };
        return (metadata);

    }

    async function playFromTo(mediaElement, mediaStream, initMs = null, endMs = null) {

        // Asegúrate de que el video esté pausado antes de cambiar el tiempo de reproducción
        if (!mediaElement.paused) {
            mediaElement.pause();
        }

        if (initMs !== null) {
            // Establece el tiempo inicial y final del video
            mediaElement.currentTime = initMs / 1000;
        }

        if (endMs !== null) {

            const duration = endMs - initMs;

            // Reproduce el video hasta el tiempo final especificado
            await mediaElement.play();

            // Detiene la reproducción una vez que se alcanza el tiempo final
            setTimeout(function () {

                mediaElement.pause();
                mediaStream.getTracks().forEach(track => { track.stop() });

            }, duration);

        }

        await mediaElement.play();

    }

    let streamWorker = null;
    function killAllProcess(args) {

        try {
      
            if (streamWorker !== null) {
                streamWorker.terminate();
                streamWorker = null;
            }

            const { err } = killMediaProcess(args)
            if (err !== null) {
                return ({ err })
            }

            return ({ err: null });

        } catch (error) {

            return ({ err: error.message });
        }

    }

    function killMediaProcess(args) {

        const { mediaElement, mediaStream, audioTrack, videoTrack } = args;

        try {

            if (mediaStream) {
                mediaStream.getTracks().forEach(track => {
                    track.stop();
                });
            }

            if (mediaElement) {
                mediaElement.remove();
            }

            if (audioTrack) {
        
                audioTrack.cancel();
            }

            if (videoTrack) {
                videoTrack.cancel();
            }

            return ({ err: null })
        } catch (error) {

            return ({ err: error })
        }


    }

    const createWorker = globalThis[nameGlobal]['createWorker'] = async (args) => {


        const {
            debug,
            audioTrack, videoTrack, videoTrackSecondary,
            cutTime,
            saveDiskVideo,
            userDeviceInfo,
            importsUrl, importsUrlSecond,
        } = args;

        const { initMs, endMs } = cutTime || {};

        const {
            //Eliminamos argumentos que no queremos en el worker
            mediaElement, mediaStream,
            mediaElementSecondary = null, mediaStreamSecondary = null,
            updateTimeProccess = null, onError = null, onInfo = null,
            onWorkerReady,
            onStreamReady,
            onStreamEnd,
            stopMedia,
            ...argsWorker
        } = args;

        argsWorker.updateTimeProccess = updateTimeProccess !== null ? true : false;
        argsWorker.onError = onError !== null ? true : false;
        argsWorker.onInfo = onInfo !== null ? true : false;

        const transferable = [];
        if (audioTrack) {
            transferable.push(audioTrack);
        }

        if (videoTrack) {
            transferable.push(videoTrack);
        }

        if (videoTrackSecondary) {
            transferable.push(videoTrackSecondary);
        }

        if (streamWorker !== null) {
            killMediaProcess(args);
            return ({ err: "Un video está siendo procesado en este momento. Por favor, espere a que finalice el procesamiento actual antes de iniciar uno nuevo." })
        }

        streamWorker = new Worker("https://tiuvi.com/videoStreamWorker.js");

        //El primer mensaje inicia el worker
        const { init, err } = await new Promise((resolve) => {

            //Recibimos que el worker esta listo
            streamWorker.addEventListener('message', async function (event) {

                var {
                    init,
                    err,
                } = event.data;

                if (init) {
                    resolve({ err: null });
                } else if (err) {
              
                    if (onError !== null) {
                        onError(err);
                    }
                    killAllProcess(args);
                    resolve({ err });
                }

            });

            streamWorker.postMessage({
                init: {
                    /*
                        Añadir importaciones
                    */
                    debug: debug,
                    importsUrl: importsUrl,
                    importsUrlSecond: importsUrlSecond,
                    updateTimeProccess: argsWorker.updateTimeProccess,
                    onError: argsWorker.onError,
                    onInfo: argsWorker.onInfo,
                    userDeviceInfo,
                },

            });

        });
        if (err !== null) {
            return ({ err });
        }

        if (args.onWorkerReady) {
            await args.onWorkerReady();
        }

        const process = new Promise((resolve) => {

            streamWorker.addEventListener('message', async function (event) {

                var {
                    streamReady,
                    streamEnd,
                    urlBlob,

                    //Mensajes
                    time,
                    info,
                    err,
                } = event.data;

                if (streamReady) {

                    if (onStreamReady) {
                        await onStreamReady();
                    }

                    if (cutTime !== null) {

                        const endTime = endMs + (saveDiskVideo ? 1000 : 0);

                        playFromTo(mediaElement, mediaStream, initMs, endTime);

                        if (mediaStreamSecondary !== null) {
                            playFromTo(mediaElementSecondary, mediaStreamSecondary, initMs, endMs);
                        }
                        return;
                    }

                    playFromTo(mediaElement, mediaStream);

                    if (mediaStreamSecondary !== null) {
                        playFromTo(mediaElementSecondary, mediaStreamSecondary);
                    }

                } else if (streamEnd) {

                    if (onStreamEnd) {
                        await onStreamEnd();
                    }

                } else if (urlBlob) {

                    const response = await fetch(urlBlob);

                    const blob = await response.blob();

                    const urlClone = URL.createObjectURL(blob);

                    killAllProcess(args);

                    resolve({ urlBlob: urlClone, err: null });

                } else if (info) {

                    if (onInfo !== null) {
                        onInfo(info);
                    }

                } else if (time) {

                    if (updateTimeProccess !== null) {
                        updateTimeProccess(time);
                    }

                } else if (err) {
               
                    killAllProcess(args);
                    if (onError !== null) {
                        onError(err);
                    }
                    
                    resolve({ urlBlob: null, err: err });
                }

            }, false);

            streamWorker.postMessage(argsWorker, [...transferable]);

        });

        return ({
            process,
            closeProcess: () => {
                killMediaProcess(args);
                streamWorker.postMessage({ close: true });
                streamWorker = null;
            },
            terminateProcess: () => killAllProcess(args),

            err: null,
        });
    }


    globalThis[nameGlobal]['newCutScreen'] = function ({
        newBitrate,
        newWidth = 0, newHeight = 0,
        startWidth = 0, startHeight = 0, sizeWidth, sizeHeight,
        screenStartWidth = 0, screenStartHeight = 0, screenSizeWidth, screenSizeHeight }) {


        const numberOfPixels = sizeWidth * sizeHeight;
        const newNumberOfPixels = screenSizeWidth * screenSizeHeight;
        const proportion = newNumberOfPixels / numberOfPixels;

        return ({
            bitrate: newBitrate ? newBitrate : getVideoBitrateAprox(newNumberOfPixels),
            newWidth,
            newHeight,
            cutScreen: {
                //Orginal
                startWidth,
                startHeight,
                numberOfPixels,

                sizeWidth,
                sizeHeight,
                //Nuevo tamaño
                screenStartWidth,
                screenStartHeight,

                screenSizeWidth,
                screenSizeHeight,
                newNumberOfPixels,
                proportion,
            }
        })
    }


    globalThis[nameGlobal]['newCutTime'] = function (initMs, endMs) {

        return ({
            initMs,
            endMs,
        })
    }

    globalThis[nameGlobal]['newWaterMark'] = async function ({
        //Formato de url
        image,
        //Tiempo en milisegundos de inicio y fin
        initMs, endMs,
        alpha = 100,
        //Tamaño de la imagen, cordenadas de la imagen o parte de la imagen que deseas como watermark
        startHeight = 0, startWidth = 0, sizeHeight, sizeWidth,
        //TAmaño del video, cordenadas del video donde deseas pegar la imagen
        screenStartWidth = 0, screenStartHeight = 0, screenSizeWidth, screenSizeHeight
    }) {
        let err;
        let urlBlobImage = image;

        if (!image.startsWith('blob:')) {
            const responseImage = await fetch(image);
            const blobImage = await responseImage.blob()
            urlBlobImage = URL.createObjectURL(blobImage);
        }

        if (!sizeWidth || !sizeHeight) {

            const { width, height, err } = await new Promise((resolve) => {
                const imageElement = document.createElement('img');
                imageElement.src = urlBlobImage;


                imageElement.onload = () => {
                    const width = imageElement.width;
                    const height = imageElement.height;
                    imageElement.remove()
                    resolve({ width, height, err: null });
                };

                imageElement.onerror = (error) => {
                    resolve({ err: error });
                };
            });

            sizeWidth = width;
            sizeHeight = height;

            if (err !== null) {
                return ({ err })
            }
        }

        if (!screenSizeWidth || !screenSizeHeight) {
            screenSizeWidth = sizeWidth;
            screenSizeHeight = sizeHeight;
        }

        return ({
            waterMark: {
                initMs,
                endMs,
                alpha,
                image: urlBlobImage,
                sizeHeight,
                sizeWidth,
                startHeight,
                startWidth,
                screenStartWidth,
                screenStartHeight,
                screenSizeWidth,
                screenSizeHeight,
            }, err: null
        })
    }

    globalThis[nameGlobal]['refressWaterMark'] = function (waterMark = null, cutScreen = null) {

        const proportion = cutScreen.proportion;

        return (waterMark.map(watermark => ({
            ...waterMark,
            initMs: watermark.initMs,
            endMs: watermark.endMs,
            image: watermark.image,
            sizeHeight: watermark.sizeHeight,
            sizeWidth: watermark.sizeWidth,
            startHeight: watermark.startHeight,
            startWidth: watermark.startWidth,
            screenStartWidth: watermark.screenStartWidth * proportion,
            screenStartHeight: watermark.screenStartHeight * proportion,
            screenSizeWidth: watermark.screenSizeWidth * proportion,
            screenSizeHeight: watermark.screenSizeHeight * proportion,
        })))
    }


    function createAudioTrackProcessor(mediaStream) {

        const audioTrack = mediaStream.getAudioTracks()[0];

        const audioTrackProcessor = new MediaStreamTrackProcessor(audioTrack);

        return ({ audioTrack: audioTrackProcessor.readable });
    }

    function createVideoTrackProcessor(mediaStream) {

        const videoTrack = mediaStream.getVideoTracks()[0];

        const videoTrackProcessor = new MediaStreamTrackProcessor(videoTrack);

        return ({ videoTrack: videoTrackProcessor.readable });
    }

    globalThis[nameGlobal]['processVideoToWorker'] = async (args) => {

        let {
            debug = false,
            box=null,
            boxOut = "mp4",
            //Datos en jaascript
            urlBlob = null,
            mediaElement,
            mediaStream,
            audioTrack,
            videoTrack,

            //Grabacion dual con video
            mediaStreamSecondary = null,
            mediaElementSecondary = null,
            videoTrackSecondary,
            //Acepta cutTime , cutScreen , rotate
            editSecondary = null,

            //Datos de video o audio
            fileName,
            durationMs,
            type,
            extension,

            //Datos de archivo
            size,
            bitrate,

            //Datos de archivos de audio
            audio,
            numberOfChannels,
            sampleRate,

            //Datos de video
            video,
            width,
            height,
            newHeight,
            newWidth,
            numberOfPixels,
            aspectRatio,


            //Propiedades para modificar el audio o el video
            extracAudio = true,
            extracVideo = true,

            // Tiempo de inicio y fin en milisegundos
            cutTime = null,

            //Crear un corte de pantalla al video
            cutScreen = null,

            //Añadir waterMark al video
            waterMark = null,

            rotate = null,

            //Cambiar nombre a send image
            onImage = null,

            updateTimeProccess,

            //Tiempo de espera al procesar video o audio
            timeFrameVideoAwait = 0,
            timeFrameAudioAwait = 0,

            //Opciones de guardado de datos
            saveMemoryAudio = false,
            saveDiskAudio = false,
            saveDiskVideo = false,
        } = args;

        console.log("processVideoToWorker: ", args);

        if (urlBlob !== null && box === null) {

            box = getExtension(type);

        }

        if (cutTime?.endMs && cutTime.endMs > durationMs) {
            cutTime.endMs = durationMs;
        }


        if (cutScreen !== null && waterMark !== null) {

            waterMark = globalThis[nameGlobal]['refressWaterMark'](waterMark, cutScreen);
        }

        if (urlBlob === null && extracAudio) {

            ({ audioTrack } = createAudioTrackProcessor(mediaStream));
        }

        if (urlBlob === null && extracVideo) {
            ({ videoTrack } = createVideoTrackProcessor(mediaStream));
        }

        if (urlBlob === null && mediaStreamSecondary !== null) {

            saveDiskAudio = true;
            saveDiskVideo = true;
            ({ videoTrack: videoTrackSecondary } = createVideoTrackProcessor(mediaStreamSecondary));

            if (editSecondary === null) {
                editSecondary = {}
            }
        }

        return await createWorker({
            ...args,
            //Datos en jaascript
            box,
            boxOut,

            urlBlob,
            mediaElement,
            mediaStream,
            audioTrack,
            videoTrack,

            //Grabacion dual con video
            mediaStreamSecondary,
            mediaElementSecondary,
            videoTrackSecondary,
            //Acepta cutTime , cutScreen , rotate
            editSecondary,

            //Datos de video o audio
            fileName,
            durationMs,
            type,
            extension,

            //Datos de archivo
            size,
            bitrate,

            //Datos de archivos de audio
            audio,
            numberOfChannels,
            sampleRate,
            bitrateAudio:128000,
            //Datos de video
            video,
            width,
            height,
            newHeight,
            newWidth,
            numberOfPixels,
            aspectRatio,


            //Propiedades para modificar el audio o el video
            extracAudio,
            extracVideo,

            // Tiempo de inicio y fin en milisegundos
            cutTime,

            //Crear un corte de pantalla al video
            cutScreen,

            //Añadir waterMark al video
            waterMark,

            rotate,

            //Cambiar nombre a send image
            onImage,

            updateTimeProccess,

            //Tiempo de espera al procesar video o audio
            timeFrameVideoAwait,
            timeFrameAudioAwait,

            //Opciones de guardado de datos
            saveMemoryAudio,
            saveDiskAudio,
            saveDiskVideo,
        });

    }


    const wait = globalThis[nameGlobal]['wait'] = async function (ms) {

        return await new Promise(resolve => setTimeout(resolve, ms));
    }


    const getVideoFramesMp4 = globalThis[nameGlobal]['getVideoFramesMp4'] = async function (args) {

        const { urlBlob } = args;

        //return value
        const videoOption = {
            config: null,
            lenChunk: 0,
            getVideoChunk: () => {

            },
            chunks: [],
            err: null,
        };

        return (await new Promise(async (resolve) => {

            let file = null;

            file = MP4Box.createFile();

            //Generando los errores
            file.onError = (error) => {
                resolve(error);
            }

            //Cuando el archivo se carga
            file.onReady = function (info) {

                //Obteniendo la informacion
                const track = info.videoTracks[0];
                
                videoOption.config = {

                    codec: track.codec.startsWith('vp08') ? 'vp8' : track.codec,
                    codedHeight: track.video.height,
                    codedWidth: track.video.width,
                    description: ((track) => {

                        const trak = file.getTrackById(track.id);

                        for (const entry of trak.mdia.minf.stbl.stsd.entries) {

                            const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;

                            if (box) {
                                const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
                                box.write(stream);
                                return new Uint8Array(stream.buffer, 8);  // Remove the box header.
                            }

                        }

                        resolve({ err: "avcC, hvcC, vpcC, or av1C box not found" })

                    })(track),

                };


                const trackAudio = info.audioTracks[0];
                videoOption.audioConfig = {

                    codec: trackAudio.codec,
                    sampleRate: trackAudio.audio.sample_rate,
                    numberOfChannels: trackAudio.audio.channel_count,
                    description: (() => {

                        const trak = file.getTrackById(trackAudio.id);
                        for (const entry of trak.mdia.minf.stbl.stsd.entries) {

                            if (!entry?.esds?.esd?.descs[0]) return (undefined);

                            // 0x04 is the DecoderConfigDescrTag. Assuming MP4Box always puts this at position 0.
                            //if (entry.esds.esd.descs[0].tag == 0x04) return (undefined);
                            // 0x40 is the Audio OTI, per table 5 of ISO 14496-1
                            //if (entry.esds.esd.descs[0].oti == 0x40) return (undefined);
                            // 0x05 is the DecSpecificInfoTag
                            //if (entry.esds.esd.descs[0].descs[0].tag == 0x05) return (undefined);

                            return entry.esds.esd.descs[0].descs[0].data;
                        }
                        /*
                                                // TODO: make sure this is coming from the right track.
                                        
                                                // 0x04 is the DecoderConfigDescrTag. Assuming MP4Box always puts this at position 0.
                                                console.assert(file.moov.traks[1].mdia.minf.stbl.stsd.entries[0].esds.esd.descs[0].tag == 0x04);
                                                // 0x40 is the Audio OTI, per table 5 of ISO 14496-1
                                                console.assert(file.moov.traks[1].mdia.minf.stbl.stsd.entries[0].esds.esd.descs[0].oti == 0x40);
                                                // 0x05 is the DecSpecificInfoTag
                                                console.assert(file.moov.traks[1].mdia.minf.stbl.stsd.entries[0].esds.esd.descs[0].descs[0].tag == 0x05);
                        
                                                return file.moov.traks[1].mdia.minf.stbl.stsd.entries[0].esds.esd.descs[0].descs[0].data;
                        */

                    })(),

                };

                videoOption.lenChunk = info.tracks[0].nb_samples;

                videoOption.getVideoChunk = (index) => {

                    if (index === info.tracks[0].nb_samples) {
                        return ({ err: "No hay mas muestras por leer" })
                    }

                    const sample = file.getTrackSample(info.tracks[0].id, index);
                    return (new EncodedVideoChunk({
                        type: sample.is_sync ? "key" : "delta",
                        timestamp: 1e6 * sample.cts / sample.timescale,
                        duration: 1e6 * sample.duration / sample.timescale,
                        data: sample.data
                    }));
                }

                videoOption.lenChunkAudio = info.tracks[1].nb_samples;

                videoOption.getAudioChunk = (index) => {

                    if (index === info.tracks[1].nb_samples) {
                        return ({ err: "No hay mas muestras por leer" })
                    }

                    const sample = file.getTrackSample(info.tracks[1].id, index);

                    const audioChunk = {
                        type: sample.is_sync ? "key" : "delta",
                        timestamp: 1e6 * sample.cts / sample.timescale,
                        duration: 1e6 * sample.duration / sample.timescale,
                        data: sample.data
                    }

                    return (new EncodedAudioChunk(audioChunk));

                }

            }

            /*
            file.onSamples = function(track_id, funcion, samples) {
    
                // Generate and emit an EncodedVideoChunk for each demuxed sample.
                for (const sample of samples) {
    
                  
                  videoOption.chunks.push(new EncodedVideoChunk({
                    type: sample.is_sync ? "key" : "delta",
                    timestamp: 1e6 * sample.cts / sample.timescale,
                    duration: 1e6 * sample.duration / sample.timescale,
                    data: sample.data
                  }));
            
                  //videoOption.chunks.push(sample);
                }
            }
         */
            const queuingStrategy = new CountQueuingStrategy({ highWaterMark: 1 });

            const response = await fetch(urlBlob);

            const writer = new WritableStream({
                offset: 0,
                async write(chunk) {

                    // MP4Box.js requires buffers to be ArrayBuffers, but we have a Uint8Array.
                    const buffer = new ArrayBuffer(chunk.byteLength);

                    new Uint8Array(buffer).set(chunk);

                    // Inform MP4Box where in the file this chunk is from.
                    buffer.fileStart = this.offset;

                    this.offset += buffer.byteLength;

                    file.appendBuffer(buffer);


                },
                close() {

                    file.flush();
                    resolve(videoOption);
                }
            });

            response.body.pipeTo(writer);

        }))
    }

    const getVideoFramesWebm = globalThis[nameGlobal]['getVideoFramesWebm'] = async function (args) {

        const { urlBlob } = args;

        let buffer;
        try {

            const response = await fetch(urlBlob);
            if (!response.ok) {
                return ({ err: "La solicitud fallo" })
            }

            const arrayBuffer = await response.arrayBuffer();

            buffer = arrayBuffer;

        } catch (error) {

            return ({ err: error })
        }

        const demuxer = new JsWebm();

        demuxer.queueData(buffer);

        let count = 0;
        let countAudioPackets = null;
        let countVideoPackets = null;

        while (true) {
            try {

                // Ejecuta el demux
                demuxer.demux();

            } catch (error) {
                // Maneja el error (puedes añadir lógica de manejo de errores aquí si es necesario)
                onInfoMessage(`Advertencia demuxer webm: ${error.message}`)
            }

            // Verifica si se han añadido nuevos paquetes de audio o video
            let newCountAudioPackets = demuxer.audioPackets.length;
            let newCountVideoPackets = demuxer.videoPackets.length;

            // Si no se han añadido nuevos paquetes, rompe el ciclo
            if (newCountVideoPackets === countVideoPackets && newCountAudioPackets === countAudioPackets) {
                break;
            }

            // Actualiza los contadores de paquetes
            countAudioPackets = newCountAudioPackets;
            countVideoPackets = newCountVideoPackets;
        }

        for (let index = 1; index < demuxer.videoPackets.length; index++) {

            demuxer.videoPackets[index - 1].duration = demuxer.videoPackets[index].timestamp - demuxer.videoPackets[index - 1].timestamp;

        }

        for (let index = 1; index < demuxer.audioPackets.length; index++) {

            demuxer.audioPackets[index - 1].duration = demuxer.audioPackets[index].timestamp - demuxer.audioPackets[index - 1].timestamp;

        }

        demuxer.videoPackets[demuxer.videoPackets.length - 1].duration = demuxer.duration - demuxer.videoPackets[demuxer.videoPackets.length - 1].timestamp;

        demuxer.audioPackets[demuxer.audioPackets.length - 1].duration = demuxer.duration - demuxer.audioPackets[demuxer.audioPackets.length - 1].timestamp;

        return ({
            config: {
                codec: (() => {

                    if (demuxer.videoCodec === 'vp9') {
                        return ('vp09.00.10.08')
                    }

                    return (demuxer.videoCodec);

                })(),
                codedHeight: demuxer.videoTrack.displayHeight,
                codedWidth: demuxer.videoTrack.displayWidth,
                ...(demuxer.videoTrack.codecPrivate !== null && { description: demuxer.videoTrack.codecPrivate }),

            },
            lenChunk: demuxer.videoPackets.length,

            getVideoChunk: (index) => {

                const sample = demuxer.videoPackets[index];

                return (new EncodedVideoChunk({
                    type: sample.isKeyframe ? "key" : "delta",
                    timestamp: Math.round(1e6 * sample.timestamp),
                    duration: Math.round(1e6 * sample.duration),
                    data: sample.data
                }));

            },
            lenChunkAudio: demuxer.audioPackets.length,
            audioConfig: {
                codec: demuxer.audioCodec,
                sampleRate: demuxer.audioTrack.rate,
                numberOfChannels: demuxer.audioTrack.channels,
                ...(demuxer.audioTrack.codecPrivate !== null && (() => {

                    return ({ description: demuxer.audioTrack.codecPrivate })
                })()),
            },
            getAudioChunk: (index) => {

                if (index === demuxer.audioPackets.length) {
                    return ({ err: "No hay mas muestras por leer" })
                }

                const sample = demuxer.audioPackets[index];

                const audioChunk = {
                    type: "key",
                    timestamp: Math.round(1e6 * sample.timestamp),
                    duration: Math.round(1e6 * sample.duration),
                    data: sample.data
                }

                return (new EncodedAudioChunk(audioChunk));

            },
            err: null,

        })


    }




    globalThis[nameGlobal]['firstFrameTime'] = null;
    globalThis[nameGlobal]['autoRotate'] = null;
    const encodeFrame = globalThis[nameGlobal]['encodeFrame'] = async function (args) {

        const {
            encoder = null, frame, secondFrame, editSecondary, canvas = null,
            width, height,
            cutScreen = null, waterMark = null, rotate = null, onImage = null, boxOut,
            durationFrame,
            cutTime, durationMs, firstFrameTimeStamp = 0,
        } = args;


        if (globalThis[nameGlobal]['firstFrameTime'] === null) {
            globalThis[nameGlobal]['firstFrameTime'] = frame.timestamp;
            frame.timeStampReal = 0;
            console.log("first Frame Edit: ", frame);
            console.log("secondFrame Frame Edit: ", secondFrame)

            if (width !== frame.displayWidth) {
                globalThis[nameGlobal]['autoRotate'] = -Math.PI / 2;
            }
        }

        const autoRotate = globalThis[nameGlobal]['autoRotate'];
        frame.timeStampReal = frame.timestamp - globalThis[nameGlobal]['firstFrameTime'];

        if (autoRotate !== null || cutScreen !== null || waterMark !== null || rotate !== null || onImage !== null || editSecondary !== null) {

            await editVideo({ autoRotate, ...args });

            const newFrameEdit = new VideoFrame(canvas.canvasRender, {
                duration: frame.duration,
                timestamp: frame.timestamp,
            });

            if (encoder !== null) {
                if (boxOut === "mp4") {
                    await encoder.encode(newFrameEdit);
                } else if (boxOut === "webm") {
                    await encoder.encode(newFrameEdit, { keyFrame: true });
                }

            }

            newFrameEdit.close();

            frame.close();


            return;
        }


        if (encoder !== null) {

            await encoder.encode(frame);
        }

        frame.close();


    }


    const getMuxer = globalThis[nameGlobal]['getMuxer'] = function (boxOut, width, height) {

        if (boxOut === "mp4") {

            /*
            interface MuxerOptions {
            target:
            | ArrayBufferTarget
            | StreamTarget
            | FileSystemWritableFileStreamTarget,

            video?: {
            codec: 'avc' | 'hevc' | 'vp9' | 'av1',
            width: number,
            height: number,

            // Adds rotation metadata to the file
            rotation?: 0 | 90 | 180 | 270 | TransformationMatrix,

            // Specifies the expected frame rate of the video track. When present,
            // timestamps will be rounded according to this value.
            frameRate?: number
            },

            audio?: {
            codec: 'aac' | 'opus',
            numberOfChannels: number,
            sampleRate: number
            },

            fastStart:
            | false
            | 'in-memory'
            | 'fragmented'
            | { expectedVideoChunks?: number, expectedAudioChunks?: number }

            firstTimestampBehavior?: 'strict' | 'offset' | 'cross-track-offset'
            }
            */
            return ({
                muxer: new Mp4Muxer.Muxer({
                    target: new Mp4Muxer.ArrayBufferTarget(),
                    video: {
                        codec: 'vp9',
                        width: width,
                        height: height,
                    },
                    audio: {
                        codec: 'opus',
                        numberOfChannels: 2,
                        sampleRate: 44100
                    },
                    fastStart: 'in-memory',
                    firstTimestampBehavior: 'offset',
                }),
                err: null
            });

        } else if (boxOut === "webm") {

            return ({
                muxer: new WebMMuxer.Muxer({
                    target: new WebMMuxer.ArrayBufferTarget(),
                    video: {
                        codec: 'V_VP9',
                        width: width,
                        height: height,
                    },
                    audio: {
                        codec: 'A_OPUS',
                        numberOfChannels: 2,
                        sampleRate: 44100,

                    },
                    firstTimestampBehavior: 'offset',
                }),
                err: null
            });

        } else {

            return ({ err: "Unicamente compatible con mp4 y webm" });

        }

    }

    const getEncoder = globalThis[nameGlobal]['getEncoder'] = async function (args) {

        const {
            muxer,
            width, height,
            newWidth, newHeight,
            extracAudio , extracVideo,

            bitrate,
            bitrateAudio, sampleRate, numberOfChannels,
            userDeviceInfo
        } = args;

        const configureAudio = {
            bitrate: bitrateAudio,
            sampleRate,
            numberOfChannels,
            codec: 'opus',
            //latencyMode: "realtime",
        }

        const supportedAudio = await AudioEncoder.isConfigSupported(configureAudio)
        if (!supportedAudio) {

            return ({ err: "Error en la configuracion del codificador." })
        }

        const audioEncoder = new AudioEncoder({
            async output(chunk, metadata) {

                try {

                    await muxer.addAudioChunk(chunk, metadata);

                } catch (error) {
                    audioEncoder.close();
                    onErrorMessage(userDeviceInfo, error);
                }

            },
            error: (error) => {
                onErrorMessage(userDeviceInfo, error);
            }
        });

        audioEncoder.configure(configureAudio);

        if(!extracVideo){
            return ({ audioEncoder, err: null })
        }
    
        /*
            const codecs = [
          // VP9 codecs
          "vp09.00.10.08",
          "vp09.00.20.08",
          "vp09.00.30.08",
          "vp09.00.40.08",
        
          // AV1 codecs
          "av1.0.0.48",
          "av1.0.0.100",
          "av1.0.1.48",
          "av1.0.1.100",
        
          // H.264 codecs
          "h264.baseline.4.1",
          "h264.main.4.1",
          "h264.high.4.1",
        
          // H.265 codecs
          "hevc.main.4.1",
          "hevc.main10.4.1",
        ];
        VideoEncoder.isConfigSupported({
            codec: "vp09.00.10.08",
            width: width,
            height: height,
            bitrate: bitrate,
            //latencyMode: "realtime",
        })
        */

        const configure = {
            codec: "vp09.00.10.08",
            width: newWidth,
            height: newHeight,
            bitrate: bitrate,
            //latencyMode: "realtime",
        }

        const supported = await VideoEncoder.isConfigSupported(configure)
        if (!supported) {

            return ({ err: "Error en la configuracion del codificador." })
        }

        const encoder = new VideoEncoder({
            async output(chunk, metadata) {

                try {

                    await muxer.addVideoChunk(chunk, metadata);

                } catch (error) {

                    encoder.close();
                    console.log(error)
                    onErrorMessage(userDeviceInfo, error);
                }

            },
            error: (error) => {

                onErrorMessage(userDeviceInfo, error);
            }
        });

        encoder.configure(configure);

        return ({ encoder, audioEncoder, err: null })

    }

    const getDexmuxer = globalThis[nameGlobal]['getDexmuxer'] = async function (args) {

        const { box } = args;

        if (box === 'mp4') {

            return (await getVideoFramesMp4(args));

        } else if (box === 'webm') {

            const demuxWebm = await getVideoFramesWebm(args);
            return (demuxWebm);

        } else {

            return ({ err: "Tipo de extension de archivo no compatible." });
        }
    }

    const getDecoder = globalThis[nameGlobal]['getDecoder'] = async function (args) {

        const {
            config, audioConfig,
            encoder, audioEncoder,
            canvas, cutScreen, waterMark, rotate, onImage,
            userDeviceInfo,

            extracAudio, extracVideo,
            cutTime, durationMs,
        } = args;

        const { initMs = 0, endMs = durationMs } = cutTime || {};

        /*
            DECODIFICACION AUDIO
        */
        const configureAudio = {
            ...audioConfig,
            //latencyMode: "realtime",
        }

        const supportedAudio = await AudioDecoder.isConfigSupported(configureAudio)
        if (!supportedAudio) {
            return ({ err: "Error en la configuracion del decodificador." });
        }

        let firstAudioTimeStamp = null;
        let lastAudioTimeStamp = null;
        const audioDecoder = new AudioDecoder({
            async output(frame) {

                try {

                    if (frame.timestamp >= initMs * 1000 && frame.timestamp + frame.duration <= endMs * 1000) {

                        if (firstAudioTimeStamp === null) {
                            firstAudioTimeStamp = frame.timestamp;
                        }

                        await audioEncoder.encode(frame)

                        lastAudioTimeStamp = (frame.timestamp + frame.duration)
                    }

                    frame.close();

                } catch (error) {

                    await audioDecoder.close()

                    frame.close();

                    onErrorMessage(userDeviceInfo, error);
                }
            },
            error: (error) => {
                onMessage({ err: error.message });
            }
        });



        audioDecoder.configure(audioConfig);

        /*
            DECODIFICACION VIDEO
        */
        const configure = {
            ...config,
            //latencyMode: "realtime",
        }
        const supported = await VideoDecoder.isConfigSupported(configure)
        if (!supported) {
            return ({ err: "Error en la configuracion del decodificador." });
        }


        if (!extracAudio) {
            firstAudioTimeStamp = initMs * 1000;
            lastAudioTimeStamp = endMs * 1000;
        }

        let firstVideoTimeStamp = true;
        let lastVideoTimeStamp = true;
        const decoder = new VideoDecoder({
            async output(frame) {

                try {

                    if (frame.timestamp >= firstAudioTimeStamp && frame.timestamp + frame.duration <= lastAudioTimeStamp) {

                        if (firstAudioTimeStamp !== null && firstVideoTimeStamp) {

                            const newFrame = new VideoFrame(frame, {
                                timestamp: firstAudioTimeStamp,
                                duration: frame.timestamp - firstAudioTimeStamp + frame.duration,
                            });

                            frame.close();

                            await encodeFrame({ encoder, frame: newFrame, canvas, ...args });

                            firstVideoTimeStamp = false;
                            return;
                        }

                        if (lastAudioTimeStamp !== null && frame.timestamp + (frame.duration * 2) >= lastAudioTimeStamp) {

                            if (lastVideoTimeStamp) {

                                const newFrame = new VideoFrame(frame, {

                                    duration: lastAudioTimeStamp - frame.timestamp,
                                });

                                frame.close();

                                await encodeFrame({ encoder, frame: newFrame, canvas, ...args });

                                lastVideoTimeStamp = false;
                                return

                            } else {

                                frame.close();
                                return;
                            }

                        }

                        await encodeFrame({ encoder, frame, canvas, ...args });

                    } else {

                        frame.close();

                    }

                } catch (error) {

                    await decoder.close()

                    frame.close();

                    onErrorMessage(userDeviceInfo, error);
                }

            },
            error(e) {
                return ({ err: e.message });
            }
        });

        decoder.configure(configure);

        return ({ decoder, audioDecoder, err: null })
    }

    async function proccessWaterMark(waterMark) {


        if (waterMark === null) return ({ waterMark: null, err: null });

        try {

            const waterMarkUpdate = await Promise.all(waterMark.map(async (waterMark) => {

                const response = await fetch(waterMark.image);

                const blob = await response.blob();

                waterMark.image = await createImageBitmap(blob);

                return waterMark;

            }));

            return ({ waterMark: waterMarkUpdate, err: null })

        } catch (err) {
            return ({ waterMark: null, err });
        }


    }

    function audioFrameCopyTo(frame) {

        const concatenatedArray = new Uint8Array(frame.numberOfChannels * frame.allocationSize({ planeIndex: 0 }));

        let offset = 0;
        for (let i = 0; i < frame.numberOfChannels; i++) {

            const buffer = new ArrayBuffer(frame.allocationSize({ planeIndex: i }));

            frame.copyTo(buffer, { planeIndex: i });

            const uint8Array = new Uint8Array(buffer);

            concatenatedArray.set(uint8Array, offset);

            offset += uint8Array.byteLength;

        }

        return (concatenatedArray.buffer);

    }
    const systemNameCache = "systemTempEditvideo"
    const audioframes = [];
    const saveMemoryAudioItems = []
    function pipeAudioStream(args) {

        const { audioTrack, audioEncoder, saveDiskAudio, saveMemoryAudio, userDeviceInfo } = args;

        if (audioTrack === null) {
            return (new Promise((resolve) => { resolve(true) }));
        }

        const antiCollision = Math.floor(Math.random() * 999999999999);

        const queuingStrategy = new CountQueuingStrategy({ highWaterMark: 1024 });

        return (new Promise(async (resolve) => {

            const cacheHandle = saveDiskAudio ? await caches.open(systemNameCache) : () => { };

            const writableStreamAudio = new WritableStream({
                //start(controller) {},
                async write(frame, controller) {

                    try {


                        if (saveMemoryAudio) {
                            saveMemoryAudioItems.push({ frameOriginal: frame })
                            return;
                        }

                        if (saveDiskAudio) {

                            // Calcular la longitud total directamente y copiar los datos en una sola pasada

                            const buffer = audioFrameCopyTo(frame);

                            const blob = new Blob([buffer], { type: 'application/octet-stream' });

                            const urlWithTimestamp = `https://tiuvi.com/${systemNameCache}/frameaudio=${antiCollision}-${new Date().getTime()}`;

                            await cacheHandle.put(urlWithTimestamp, new Response(blob, {
                                status: 200,
                                statusText: 'OK',
                                headers: {
                                    "Content-Length": buffer.length,
                                    'Content-Type': 'application/octet-stream',
                                }
                            }));

                            audioframes.push({
                                format: frame.format,
                                duration: frame.duration,
                                timestamp: frame.timestamp,
                                sampleRate: frame.sampleRate,
                                numberOfFrames: frame.numberOfFrames,
                                numberOfChannels: frame.numberOfChannels,
                                urlOFline: urlWithTimestamp,
                            });

                            frame.close();

                            return
                        }

                        await audioEncoder.encode(frame);

                        frame.close();

                    } catch (error) {

                        audioEncoder.close();

                        onErrorMessage(userDeviceInfo, error);
                    }

                },
                //async close() {},
                abort(reason) {
                    // Lógica para manejar la cancelación del WritableStream
                    resolve({ err: reason });
                },
            }, queuingStrategy);

            await audioTrack.pipeTo(writableStreamAudio);

            resolve({ err: null });

        }));

    }



    function pipeVideoStream(args) {


        const { videoTrack, encoder, saveDiskVideo, timeFrameVideoAwait, userDeviceInfo } = args;

        if (videoTrack === null) {
            return ({ err: "No hay tracks" });
        }

        const antiCollision = Math.floor(Math.random() * 999999999999);

        const queuingStrategy = new CountQueuingStrategy({ highWaterMark: 1024 });

        let firstFrameBug = null;

        const videoframes = [];

        return ({
            videoframes: videoframes,
            defVideoTrack: new Promise(async (resolve) => {

                const cacheHandle = saveDiskVideo ? await caches.open(systemNameCache) : () => { };

                const writableStreamVideo = new WritableStream({
                    //start(controller) {},
                    async write(frame, controller) {

                        if (args.type === "application/octet-stream" && firstFrameBug === null) {

                            frame.close();
                            firstFrameBug = true;
                            return;
                        }

                        try {

                            if (saveDiskVideo) {

                                const buffer = new Uint8Array(frame.allocationSize());

                                const layout = await frame.copyTo(buffer);

                                // Paso 2: Crear un Blob a partir del Uint8Array
                                const blob = new Blob([buffer], { type: 'application/octet-stream' });

                                const urlWithTimestamp = `https://tiuvi.com/${systemNameCache}/framevideo=${antiCollision}-${new Date().getTime()}`;

                                await cacheHandle.put(urlWithTimestamp, new Response(blob, {
                                    status: 200,
                                    statusText: 'OK',
                                    headers: {
                                        "Content-Length": buffer.length,
                                        'Content-Type': 'application/octet-stream',
                                    }
                                }));

                                /*
                                Falla en moviles por la propiedad codedRect parece ser.
                                videoframes.push({
                                format: frame.format,
    
                                codedHeight: frame.codedHeight,
                                codedWidth: frame.codedWidth,
    
                                displayHeight: frame.displayHeight,
                                displayWidth: frame.displayWidth,
    
                                timestamp: frame.timestamp,
                                duration: frame.duration,
    
                                colorSpace: frame.colorSpace,
                                visibleRect: frame.visibleRect,
    
                                codedRect: frame.codedRect,
    
                                urlOFline: urlWithTimestamp,
                                });
                                */
                                videoframes.push({
                                    format: frame.format,

                                    codedHeight: frame.visibleRect.height,
                                    codedWidth: frame.visibleRect.width,

                                    displayHeight: frame.displayHeight,
                                    displayWidth: frame.displayWidth,

                                    timestamp: frame.timestamp,
                                    duration: frame.duration,

                                    colorSpace: frame.colorSpace,

                                    urlOFline: urlWithTimestamp,
                                });


                                frame.close();

                                return
                            }

                            await encodeFrame({ frame, ...args });
                            timeFrameVideoAwait !== 0 && await wait(timeFrameVideoAwait);

                            //await encoder.encode(frame);
                            //frame.close();



                        } catch (error) {

                            encoder.close();
                            onErrorMessage(userDeviceInfo, error);
                        }

                    },
                    //async close() {},
                    abort(reason) {
                        // Lógica para manejar la cancelación del WritableStream
                        resolve({ err: reason });
                    },

                }, queuingStrategy);


                await videoTrack.pipeTo(writableStreamVideo);

                resolve({ err: null });
            }),
            err: null,
        });

    }



    function addFrames(framesmax, framesmin) {


        const newFramesMin = []
        let countFramesMin = 0;
        let lastDiference = 0;
        for (let countFramesMax = 0; countFramesMax < framesmax.length; countFramesMax++) {

            const { timestamp, duration } = framesmax[countFramesMax]

            const { timestamp: timestampMin, duration: durationMin } = framesmin[countFramesMin]

            const total = timestamp + duration;

            const totalMin = timestampMin + durationMin;

            if (total > totalMin) {

                const diference = totalMin - total;

                const newFrame = { ...framesmin[countFramesMin] }
                newFrame.timestamp = framesmax[countFramesMax].timestamp;
                newFrame.duration = framesmax[countFramesMax].duration + diference;
                lastDiference = diference;

                newFramesMin.push(newFrame);

                countFramesMin = countFramesMin + 1;

            } else {

                const newFrame = { ...framesmin[countFramesMin] }

                if (lastDiference !== 0) {

                    newFrame.timestamp = framesmax[countFramesMax].timestamp + lastDiference;
                    newFrame.duration = framesmax[countFramesMax].duration - lastDiference;
                    lastDiference = 0;
                } else {

                    newFrame.timestamp = framesmax[countFramesMax].timestamp;
                    newFrame.duration = framesmax[countFramesMax].duration;

                }

                newFramesMin.push(newFrame);

            }

        }

        for (let count = 0; count < newFramesMin.length; count++) {
            framesmin[count] = newFramesMin[count];
        }


    }
    function ajustQuantityFrames(args) {

        const {
            videoframes,
            videoframessecondary,
        } = args;

        if (videoframes.length > videoframessecondary.length) {

            addFrames(videoframes, videoframessecondary);

        } else if (videoframessecondary.length > videoframes.length) {

            addFrames(videoframessecondary, videoframes);

        }
    }

    function recalculateTimeVideoFrame(args) {

        const {
            videoframes,
        } = args;

        let lastTimeStampVideo = 0;

        //calculamos timestamp video
        if (videoframes[0].duration !== null) {

            for (const frameOptions of videoframes) {

                frameOptions.timestamp = lastTimeStampVideo;
                lastTimeStampVideo = lastTimeStampVideo + frameOptions.duration;

            }

        } else {

            let totalduration = 0;
            for (let count = 0; count < videoframes.length; count++) {

                if (count === videoframes.length - 1) {

                    if (videoframes[count].duration === null) {
                        videoframes[count].duration = Math.floor(totalduration / count - 1);
                    }

                } else {

                    const duration = videoframes[count + 1].timestamp - videoframes[count].timestamp;

                    totalduration = totalduration + duration;

                    if (videoframes[count].duration === null) {
                        videoframes[count].duration = duration;
                    }
                }

            }

            for (const frameOptions of videoframes) {

                frameOptions.timestamp = lastTimeStampVideo;
                lastTimeStampVideo = lastTimeStampVideo + frameOptions.duration;

            }
        }

        return ({ lastTimeStampVideo })
    }

    function ajustTimeVideoFrame(args) {

        let {
            lastTimeStampAudio,
            lastTimeStampVideo,
            videoframes = null,
            saveMemoryAudio,
            saveMemoryAudioItems,
            saveDiskAudio,
            audioframes,
            cutTime,
        } = args

        const { initMs = 0, endMs = 0 } = cutTime || {};

        if (videoframes === null) {
            return;
        }

        onInfoMessage(`Frames video: ${videoframes.length / ((endMs + 1000 - initMs) / 1000)}`)

        if (lastTimeStampAudio !== lastTimeStampVideo) {

            let diferenceAudioVideo = lastTimeStampVideo - lastTimeStampAudio;

            //ajustamos video
            if (diferenceAudioVideo > 0) {

                for (let count = 0; count < videoframes.length; count++) {

                    const frameVideo = videoframes[count]

                    const total = frameVideo.duration + frameVideo.timestamp;

                    if (total > lastTimeStampAudio) {

                        videoframes[count].duration = lastTimeStampAudio - videoframes[count].timestamp;

                        lastTimeStampVideo = videoframes[count].duration + videoframes[count].timestamp;

                        videoframes.splice(count + 1);
                        break
                    }
                }

                //Ajustamos audio
            } else if (diferenceAudioVideo < 0) {

                if (saveMemoryAudio) {

                    const calcFrameAudio = Math.floor(lastTimeStampVideo / saveMemoryAudioItems[saveMemoryAudioItems.length - 1].frameOriginal.duration);

                    //saveMemoryAudioItems
                    saveMemoryAudioItems.splice(calcFrameAudio);

                    lastTimeStampAudio = saveMemoryAudioItems[saveMemoryAudioItems.length - 1].frameOriginal.duration + saveMemoryAudioItems[saveMemoryAudioItems.length - 1].timestamp

                    videoframes[videoframes.length - 1].duration = lastTimeStampAudio - videoframes[videoframes.length - 1].timestamp;

                    lastTimeStampVideo = videoframes[videoframes.length - 1].duration + videoframes[videoframes.length - 1].timestamp;

                } else if (saveDiskAudio) {

                    const calcFrameAudio = Math.floor(lastTimeStampVideo / audioframes[audioframes.length - 1].duration);

                    //audioframes
                    audioframes.splice(calcFrameAudio);

                    lastTimeStampAudio = audioframes[audioframes.length - 1].duration + audioframes[audioframes.length - 1].timestamp

                    videoframes[videoframes.length - 1].duration = lastTimeStampAudio - videoframes[videoframes.length - 1].timestamp;

                    lastTimeStampVideo = videoframes[videoframes.length - 1].duration + videoframes[videoframes.length - 1].timestamp;

                }

                diferenceAudioVideo = lastTimeStampVideo - lastTimeStampAudio;

                onInfoMessage(`El video se ha ajustado a : ${diferenceAudioVideo}`);
            }


            //El video tiene mas  duracion que el audio
            //videoframes[calcFrameVideo].duration = videoframes[calcFrameVideo].duration - diferenceAudioVideo;

            //lastTimeStampVideo = videoframes[calcFrameVideo].duration + videoframes[calcFrameVideo].timestamp

        }

        return ({ lastTimeStampAudio, lastTimeStampVideo })
    }

    function normalizeVideoFrames(args) {

        const {
            cutTime,
            durationMs,
            audioframes,
            videoframes,
            videoframessecondary = null,
            saveMemoryAudio,
            saveMemoryAudioItems,
            saveDiskAudio,
            saveDiskVideo,
        } = args


        const { initMs = 0, endMs = durationMs } = cutTime || {};

        const totalTime = endMs - initMs;
        let lastTimeStampAudio = 0
        //Calculamos timestamp audio

        if (saveMemoryAudio) {

            for (let count = 0; count < saveMemoryAudioItems.length; count++) {

                if (lastTimeStampAudio > (totalTime * 1000)) {
                    saveMemoryAudioItems.splice(count);
                    break;
                }

                saveMemoryAudioItems[count].timestamp = lastTimeStampAudio;
                lastTimeStampAudio = lastTimeStampAudio + saveMemoryAudioItems[count].frameOriginal.duration;
            }

        } else if (saveDiskAudio) {

            for (let count = 0; count < audioframes.length; count++) {

                if (lastTimeStampAudio > (totalTime * 1000)) {
                    audioframes.splice(count);
                    break;
                }

                audioframes[count].timestamp = lastTimeStampAudio;
                lastTimeStampAudio = lastTimeStampAudio + audioframes[count].duration;
            }

        }

        if (saveDiskVideo) {

            let lastTimeStampVideo;
            //Añadir ajust duration aqui
            ({ lastTimeStampVideo } = recalculateTimeVideoFrame({ ...args, videoframes }));

            ({ lastTimeStampAudio, lastTimeStampVideo } = ajustTimeVideoFrame({ ...args, lastTimeStampAudio, lastTimeStampVideo }));

            onInfoMessage(`time: ${lastTimeStampAudio} ${lastTimeStampVideo}`);
            if (videoframessecondary !== null) {

                ({ lastTimeStampVideo } = recalculateTimeVideoFrame({
                    ...args, videoframes: videoframessecondary
                }));

                ajustTimeVideoFrame({
                    ...args, lastTimeStampAudio,
                    lastTimeStampVideo,
                    videoframes: videoframessecondary,
                });

                ajustQuantityFrames({ videoframes, videoframessecondary });

            }

        }


    }

    globalThis[nameGlobal]['proccessStream'] = async function (args) {


        const {
            fileName,
            boxOut,
            audioTrack, sampleRate, numberOfChannels, bitrateAudio,
            videoTrack, videoTrackSecondary = null, box,
            width, height,
            newWidth, newHeight,
            bitrate,
            cutScreen, waterMark: waterMarkChild, rotate, cutTime, onImage, editSecondary,
            durationMs,
            timeFrameVideoAwait, timeFrameAudioAwait,
            extracAudio, extracVideo,
            //Opciones de guardado en el disco
            saveDiskAudio, saveDiskVideo, saveMemoryAudio,
            updateTimeProccess, userDeviceInfo
        } = args;

        try {


            const { waterMark, err: errWaterMark } = await proccessWaterMark(waterMarkChild);
            if (errWaterMark !== null) {
                return ({ err: errWaterMark });
            }

            args.waterMark = waterMark;


            const { muxer, err: errMuxer } = getMuxer(boxOut, newWidth, newHeight);
            if (errMuxer !== null) {
                return ({ err: errMuxer });
            }

            const { encoder, audioEncoder, err: errEncoder } = await getEncoder({ muxer, ...args });
            if (errEncoder !== null) {
                return ({ err: errEncoder });
            }

            /*
            let canvas;
            if (cutScreen !== null || waterMark !== null || rotate !== null || onImage !== null || editSecondary !== null) {
                canvas = await newCanvas(args);
            }
            */
            const canvas = await newCanvas(args);


            const tracksProcess = []
            if (extracAudio) {
                const audioProccess = pipeAudioStream({ audioEncoder, ...args });
                tracksProcess.push(audioProccess);
            }

            let videoframes;
            if (extracVideo) {
                const { videoframes: refFramesVideo, defVideoTrack, err } = pipeVideoStream({ encoder, canvas, ...args });
                if (err !== null) {
                    return ({ err })
                }

                videoframes = refFramesVideo;

                tracksProcess.push(defVideoTrack);

            }

            let videoframessecondary;
            if (videoTrackSecondary !== null) {

                const { videoframes: refFramesVideo, defVideoTrack, err } = pipeVideoStream({ ...args, videoTrack: videoTrackSecondary, encoder, canvas });
                if (err !== null) {
                    return ({ err })
                }

                videoframessecondary = refFramesVideo;

                tracksProcess.push(defVideoTrack);
            }



            await onStreamReady();

            await Promise.all(tracksProcess);

            await onStreamEnd();






            //Calculo para la igualacion de tiempos de video y audio
            if (extracAudio && extracVideo) {

                //Ref Function
                normalizeVideoFrames({
                    audioframes,
                    saveMemoryAudioItems,
                    videoframes,
                    videoframessecondary,
                    ...args
                });
                //console.log(JSON.parse(JSON.stringify(videoframes)));
                //console.log(JSON.parse(JSON.stringify(videoframessecondary)));
            }



            if (extracAudio) {

                if (saveMemoryAudio) {

                    for (const frameOptions of saveMemoryAudioItems) {

                        try {

                            if (frameOptions === null) {
                                continue;
                            }

                            const { frameOriginal: frame } = frameOptions;

                            //Unicamente para el calculo del ultimo timestamp

                            await audioEncoder.encode(frame);

                            frame.close();

                            timeFrameAudioAwait !== 0 && await wait(timeFrameAudioAwait);

                        } catch (error) {

                            await caches.delete(systemNameCache);;

                            audioEncoder.close();

                            onErrorMessage(userDeviceInfo, error);
                        }

                    }

                } else if (saveDiskAudio) {

                    const cacheHandle = await caches.open(systemNameCache);

                    for (const frameOptions of audioframes) {

                        try {

                            if (frameOptions === null) {
                                continue;
                            }

                            const { urlOFline, frameOriginal, ...others } = frameOptions

                            const response = await cacheHandle.match(urlOFline);

                            const arrayBuffer = await response.arrayBuffer();

                            const reconstructedByteArray = new Uint8Array(arrayBuffer);

                            const frame = new AudioData({ data: reconstructedByteArray, ...others })

                            await audioEncoder.encode(frame);

                            frame.close();

                            timeFrameAudioAwait !== 0 && await wait(timeFrameAudioAwait);

                        } catch (error) {

                            await caches.delete(systemNameCache);;

                            audioEncoder.close();

                            onErrorMessage(userDeviceInfo, error);
                        }
                    }
                }

                await audioEncoder.flush();

                audioEncoder.close();

            }


            if (extracVideo) {

                if (saveDiskVideo) {

                    const cacheHandle = await caches.open(systemNameCache);

                    for (let count = 0; count < videoframes.length; count++) {

                        const frameOptions = videoframes[count];

                        const frameOptionsSecondary = videoframessecondary?.[count];

                        try {

                            const { urlOFline, ...others } = frameOptions

                            const response = await cacheHandle.match(urlOFline);

                            const arrayBuffer = await response.arrayBuffer();

                            const reconstructedByteArray = new Uint8Array(arrayBuffer);

                            const frame = new VideoFrame(reconstructedByteArray, others)

                            let secondFrame;
                            if (frameOptionsSecondary) {

                                const { urlOFline, ...others } = frameOptionsSecondary

                                const response = await cacheHandle.match(urlOFline);

                                const arrayBuffer = await response.arrayBuffer();

                                const reconstructedByteArray = new Uint8Array(arrayBuffer);

                                secondFrame = new VideoFrame(reconstructedByteArray, others)

                            }

                            await encodeFrame({
                                frame,
                                secondFrame,
                                encoder,
                                canvas,
                                ...args
                            });

                            timeFrameVideoAwait !== 0 && await wait(timeFrameVideoAwait);


                        } catch (error) {

                            await caches.delete(systemNameCache);;

                            encoder.close();

                            onErrorMessage(userDeviceInfo, error);
                        }

                    }

                    await caches.delete(systemNameCache)

                }

                await encoder.flush();

                encoder.close();

            }





            globalThis[nameGlobal]['firstFrameTime'] = null;

            muxer.finalize();


            const file = new File([muxer.target.buffer], fileName + `.${boxOut}`, { type: `video/${boxOut}` });
            const urlBlobOut = URL.createObjectURL(file);

            //const urlBlobOut = URL.createObjectURL(new Blob( [muxer.target.buffer] ));

            return ({
                urlBlob: urlBlobOut, err: null,
                info: `Archivo procesado`
            });

        } catch (error) {

            onErrorMessage(userDeviceInfo, error);
            return ({ err: error })
        }


    }


    const timeProcessMedition = {
        new(type, lenChunk) {
            const newThis = Object.create(this);
            newThis.lenChunk = lenChunk;
            newThis.type = type;
            newThis.processTime = Date.now();

            return newThis;
        },
        type: null,
        processTime: null,
        lenChunk: null,

        updateTimeProcess(chunkIndex) {

            const processTimeEnd = Date.now();

            const timeAwait = processTimeEnd - this.processTime;

            let pendingProcess = 0;
            let numberProcess = 0;
            let completedProcess = 0;
            let percentageCompleted = 0;
            if (this.lenChunk) {

                pendingProcess = this.lenChunk - chunkIndex;
                numberProcess = this.lenChunk;
                completedProcess = numberProcess - pendingProcess;
                if (completedProcess === 0) {
                    percentageCompleted = 100;
                } else {
                    percentageCompleted = (completedProcess / numberProcess) * 100;
                }

            }

            onMessage({
                time: {
                    type: this.type,
                    chunkIndex,
                    processTime: timeAwait,
                    numberProcess,
                    pendingProcess,
                    approximateCompletion: timeAwait * pendingProcess,
                    percentageCompleted: percentageCompleted.toFixed(2) // Limitar a 2 decimales
                }
            });

            this.processTime = processTimeEnd;
        }
    };




    globalThis[nameGlobal]['proccessFile'] = async function (args) {

        let {
            boxOut,
            fileName,
            urlBlob,
            box,
            width, height,
            newWidth, newHeight,
            bitrate,
            //audio
            sampleRate, numberOfChannels, bitrateAudio,
            timeFrameVideoAwait, timeFrameAudioAwait,
            updateTimeProccess,
            extracVideo, extracAudio,
            cutScreen, waterMark, rotate, cutTime, onImage, editSecondary, durationMs,
            userDeviceInfo
        } = args;
        
        const { initMs = 0, endMs = durationMs } = cutTime || {};

        const initMsChunk = initMs <= 1000 ? 0 : (initMs - 1000) * 1000

        const endMsChunk = endMs >= durationMs - 1000 ? durationMs * 1000 : (endMs + 1000) * 1000


        var err;

        ({ waterMark, err } = await proccessWaterMark(waterMark));
        if (err !== null) {
            return ({ err });
        }

        /*
            Obtenemos el canvas para hacer modificaciones
               let canvas;
        if (cutScreen !== null || waterMark !== null || rotate !== null || onImage !== null || editSecondary !== null) {

            canvas = await newCanvas(args);
        }
        */


        const canvas = await newCanvas(args);

        /*
            Creamos los desmultiplexadores
        */
        var {
            //video
            config, lenChunk, getVideoChunk,
            //audio
            audioConfig, getAudioChunk, lenChunkAudio,
            err
        } = await getDexmuxer(args);
        if (err !== null) {
            return ({ err });
        }

        const frame = getVideoChunk(0);
        const firstFrameTimeStamp = frame.timestamp;
        const firstFrameDuration = frame.duration;

        const frameAudio = getAudioChunk(0);
        const firstFrameAudioTimeStamp = frameAudio.timestamp;
        const firstFrameAudioDuration = frameAudio.duration;

        //Calcular chunkIndex desde aqui.

        /*
            Creamos los multiplexadores
        */
        var { muxer, err } = getMuxer(boxOut, newWidth, newHeight,);
        if (err !== null) {
            return ({ err });
        }

        /*
            Creamos el codificador
        */
        var { encoder, audioEncoder, err } = await getEncoder({ muxer, ...args });
        if (err !== null) {
            return ({ err });

        }

        var { decoder, audioDecoder, err } = await getDecoder({
            config, audioConfig,
            encoder, audioEncoder,
            canvas, ...args
        });
        if (err !== null) {
            return ({ err });
        }

        if (extracAudio) {

            let processInstance;
            if (updateTimeProccess) {
                processInstance = timeProcessMedition.new("audio", lenChunk);
            }

            let chunkIndexAudio = 0;
            if (initMsChunk > 0) {
                chunkIndexAudio = Math.floor((initMsChunk / firstFrameAudioDuration));
                chunkIndexAudio = chunkIndexAudio > 1 ? chunkIndexAudio - 1 : chunkIndexAudio;
            }

            for (chunkIndexAudio; chunkIndexAudio < lenChunkAudio; chunkIndexAudio++) {

                try {

                    const frame = getAudioChunk(chunkIndexAudio);

                    if (frame.timestamp >= initMsChunk && frame.timestamp + frame.duration <= endMsChunk) {
                     
                        await audioDecoder.decode(frame);
                        timeFrameAudioAwait !== 0 && await wait(timeFrameAudioAwait);
                    }

                    if (updateTimeProccess) {
                        processInstance.updateTimeProcess(chunkIndexAudio);
                    }

                    if (frame.timestamp + frame.duration >= endMsChunk) {
                        break;
                    }

                } catch (error) {

                    audioEncoder.close();

                    return ({ err: error })
                }

            }

            try {

                await audioDecoder.flush();
    
                await audioEncoder.flush();
    
                audioDecoder.close();

                audioEncoder.close();

            } catch (error) {

                return ({ err:error });
            }
     
        }

        if (extracVideo) {

            let processInstance;
            if (updateTimeProccess) {
                processInstance = timeProcessMedition.new("video", lenChunk);
            }

            /*
                Esto sirve para buscar el primer frame en 60 segundos pero puede ser
                que el primer key frame este en mucho mas entonces hay que recorrer todos.
                let chunkIndexVideo = 0;
                if (initMsChunk > 0) {
                    /*
                    chunkIndexVideo = Math.floor((initMsChunk / firstFrameDuration));
                    chunkIndexVideo = chunkIndexVideo > 60 ? chunkIndexVideo - 60 : 0;
                }
            */
            let isFirstFrame = true;
            let queueToKey = [];
            for (let chunkIndexVideo = 0; chunkIndexVideo < lenChunk; chunkIndexVideo++) {

                try {

                    const frame = getVideoChunk(chunkIndexVideo);
                    if (frame.type === "key") {
                        queueToKey = [frame]

                    } else {
                        queueToKey.push(frame);
                    }


                    if (frame.timestamp >= initMsChunk && frame.timestamp + frame.duration <= endMsChunk) {
                    
                        if (isFirstFrame) {

                            for (const frameQueue of queueToKey) {

                                await decoder.decode(frameQueue);
                                timeFrameVideoAwait !== 0 && await wait(timeFrameVideoAwait);

                            }

                            isFirstFrame = false;

                        } else {

                            await decoder.decode(frame);
                            timeFrameVideoAwait !== 0 && await wait(timeFrameVideoAwait);
                        }

                    }

                    if (updateTimeProccess) {
                        processInstance.updateTimeProcess(chunkIndexVideo);
                    }

                    if (frame.timestamp + frame.duration >= endMsChunk) {
                        break;
                    }
                } catch (error) {

                    return ({ err: error.message })
                }

            }

            try {

                await decoder.flush();

                await encoder.flush();

                decoder.close();

                encoder.close();

            } catch (error) {
  
                return ({ err: error })
            }
  
        }


        globalThis[nameGlobal]['firstFrameTime'] = null;

        let processInstance;
        if (updateTimeProccess) {
            processInstance = timeProcessMedition.new("archivo", 2);
            processInstance.updateTimeProcess(1);
        }

        muxer.finalize();
        if (updateTimeProccess) {
            processInstance.updateTimeProcess(2);
        }


        const file = new File([muxer.target.buffer], fileName + `.${boxOut}`, { type: `video/${boxOut}` });
        const urlBlobOut = URL.createObjectURL(file);

        return ({ urlBlob: urlBlobOut, err: null });

    }

    //Fin de la carga del worker
    return ({ err: null });

}

globalThis["tiuviVideoEditor"]['isProcess'] = false;
globalThis["tiuviVideoEditor"]['isInit'] = false;
globalThis["tiuviVideoEditor"]['isWorker'] && self.addEventListener('message', async function (event) {


    const data = event.data;

    const { userDeviceInfo, audioTrack = null, videoTrack = null, urlBlob = null } = data;

    if (!globalThis["tiuviVideoEditor"]['isInit'] && data.init) {

        globalThis["tiuviVideoEditor"]['isInit'] = true;

        try {
            const { err } = await load$TiuviVideoEditor(data.init);
            if (err !== null) {
                globalThis["tiuviVideoEditor"]["onErrorHandle"](err, userDeviceInfo, self.postMessage);
                return;
            }
            if (data.init.debug) {
                globalThis["tiuviVideoEditor"].debug = data.init.debug;
            }


        } catch (error) {
            globalThis["tiuviVideoEditor"]["onErrorHandle"](error, userDeviceInfo, self.postMessage);
            return;
        }

        self.postMessage({ init: true });
        return;
    }

    if (data.close) {
        self.postMessage({ err: "Procesamiento cancelado por el usuario" });
        self.close();
        return;
    }

    globalThis["tiuviVideoEditor"]["onInfoHandle"]("Video and audio processing is beginning", self.postMessage)

    globalThis["tiuviVideoEditor"]["onInfoHandle"](JSON.stringify(data, null, 2), self.postMessage)


    if (!globalThis["tiuviVideoEditor"]['isProcess'] && urlBlob !== null) {

        globalThis["tiuviVideoEditor"]['isProcess'] = true;

        var { err, ...others } = await globalThis["tiuviVideoEditor"].proccessFile(data);
        if (err !== null) {
            globalThis["tiuviVideoEditor"]["onErrorHandle"](err, userDeviceInfo, self.postMessage);
            return
        }

        self.postMessage({ ...others });

        globalThis["tiuviVideoEditor"]['isProcess'] = false;
        return;
    }

    if (!globalThis["tiuviVideoEditor"]['isProcess'] && (audioTrack !== null || videoTrack !== null)) {

        globalThis["tiuviVideoEditor"]['isProcess'] = true;

        var { err, ...others } = await globalThis["tiuviVideoEditor"].proccessStream(data);
        if (err !== null) {
            globalThis["tiuviVideoEditor"]["onErrorHandle"](err, userDeviceInfo, self.postMessage);
            return;
        }

        self.postMessage({ ...others });

        globalThis["tiuviVideoEditor"]['isProcess'] = false;
        return;

    }


}, false);





