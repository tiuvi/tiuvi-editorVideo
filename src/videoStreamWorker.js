'use strict';


importScripts(
    //desmultiplexacion
    'https://cell1.tiuvi.com:1030/mp4box.js',
    'https://cell1.tiuvi.com:1030/webmDemuxer.js',

    //Multiplexacion
    'https://cell1.tiuvi.com:1030/mp4-multiplexer.js',
    'https://cell1.tiuvi.com:1030/webm-multiplexer.js',
);

async function wait(ms) {

    return await new Promise(resolve => setTimeout(resolve, ms));
}

async function getVideoFramesMp4(uri, debug = false) {

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

        let setStatus = () => {
            if (debug) { console.log(arguments) };
        }

        file = MP4Box.createFile();

        //Generando los errores
        file.onError = error => {
            setStatus("demux", error);
        }

        //Cuando el archivo se carga
        file.onReady = function (info) {

            setStatus("demux", "Ready");

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

            //console.log("info: ", info);


            videoOption.lenChunk = info.tracks[0].nb_samples;

            //console.log(info.tracks[0]);

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


            file.setExtractionOptions(track.id);

            //file.start();

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
            console.log(videoOption.chunks);
        }
*/
        const queuingStrategy = new CountQueuingStrategy({ highWaterMark: 1 });

        const response = await fetch(uri);

        const writer = new WritableStream({
            offset: 0,
            async write(chunk) {

                // MP4Box.js requires buffers to be ArrayBuffers, but we have a Uint8Array.
                const buffer = new ArrayBuffer(chunk.byteLength);

                new Uint8Array(buffer).set(chunk);

                // Inform MP4Box where in the file this chunk is from.
                buffer.fileStart = this.offset;

                this.offset += buffer.byteLength;

                // Append chunk.
                setStatus("fetch", (this.offset / (1024 ** 2)).toFixed(1) + " MiB");

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

async function getVideoFramesWebm(url) {

    const { buffer, err = null } = await (async (url) => {

        try {
            const response = await fetch(url);
            if (!response.ok) {
                return ({ err: "La solicitud fallo" })
            }

            const arrayBuffer = await response.arrayBuffer();

            return ({ buffer: arrayBuffer });

        } catch (error) {

            return ({ err: error.message })
        }

    })(url)

    if (err !== null) {
        return ({ err })
    }

    const demuxer = new JsWebm();

    demuxer.queueData(buffer);

    let count = 0;
    while (!demuxer.eof) {

        demuxer.demux();

    }

    for (let index = 1; index < demuxer.videoPackets.length; index++) {

        demuxer.videoPackets[index - 1].duration = demuxer.videoPackets[index].timestamp - demuxer.videoPackets[index - 1].timestamp;

    }

    demuxer.videoPackets[demuxer.videoPackets.length - 1].duration = demuxer.duration - demuxer.videoPackets[demuxer.videoPackets.length - 1].timestamp;

    console.log(demuxer);


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
        err: null,


    })


}

async function editVideo(canvas ,ctx, frame, cutImage, waterMarkImage, rotateImage, sendImage) {

    const waterMark = waterMarkImage;

    const cut = cutImage;

    const rotate = rotateImage;

    const send = sendImage;

    ctx.save();

    if (rotate !== null) {
        ctx.rotate(rotate);
    }

    if (cut !== null) {

        ctx.drawImage(frame,
            //Primeras coordenadas se obtienen del lienzo original
            cut.startWidth, cut.startHeight, cut.sizeWidth, cut.sizeHeight,
            //Las Segundas cordenadas son para el final
            cut.screenStartWidth, cut.screenStartHeight, cut.screenSizeWidth, cut.screenSizeHeight);

    } else {

        ctx.drawImage(frame, 0, 0);
    }

    if (waterMark !== null) {

        ctx.drawImage(waterMark.image,
            //Primeras coordenadas se obtienen del lienzo original
            waterMark.startWidth, waterMark.startHeight, waterMark.sizeWidth, waterMark.sizeHeight,
            //Las Segundas cordenadas son para el final
            waterMark.screenStartWidth, waterMark.screenStartHeight, waterMark.screenSizeWidth, waterMark.screenSizeHeight);

    }

    if (send) {

        const blob = await canvas.convertToBlob();
        self.postMessage({ urlImage: URL.createObjectURL(blob) });

    }

    ctx.restore();


}

async function encodeFrame(encoder=null, frame, canvas=null, ctx=null, cut=null, waterMark=null, rotate=null, sendImage=null) {

    if (cut !== null || waterMark !== null || rotate !== null || sendImage !== null) {

        await editVideo(canvas, ctx, frame, cut, waterMark, rotate, sendImage);

        const newframe = new VideoFrame(canvas, {
            duration: frame.duration,
            timestamp: frame.timestamp,
        })

        if(encoder !== null) await encoder.encode(newframe);

        newframe.close();

    } else {

        if(encoder !== null) await encoder.encode(frame);

    }

    frame.close();

}


function getMuxer(box, width, height) {

    if (box === "mp4") {

        return ({
            muxer: new Mp4Muxer.Muxer({
                target: new Mp4Muxer.ArrayBufferTarget(),
                video: {
                    codec: 'vp9',
                    width: width,
                    height: height,
                },
                fastStart: 'fragmented',
                firstTimestampBehavior: 'offset',
            }),
            err: null
        });

    } else if (box === "webm") {

        return ({
            muxer: new WebMMuxer.Muxer({
                target: new WebMMuxer.ArrayBufferTarget(),
                video: {
                    codec: 'V_VP9',
                    width: width,
                    height: height,
                },
                firstTimestampBehavior: 'offset',
            }),
            err: null
        });

    } else {

        return ({ err: "Unicamente compatible con mp4 y webm" });

    }

}

async function getEncoder(muxer, width, height, bitrate) {

    const configure = {
        codec: "vp09.00.10.08",
        width: width,
        height: height,
        bitrate: bitrate,
        latencyMode: "realtime",
    }

    const supported = await VideoEncoder.isConfigSupported(configure)
    if (!supported) {

        return ({ err: "Error en la configuracion del codificador." })
    }

    const encoder = new VideoEncoder({
        async output(chunk, metadata) {

            await muxer.addVideoChunk(chunk, metadata);

        },
        error: (e) => {
            self.postMessage(e.message);
        }
    });

    encoder.configure(configure);

    return ({ encoder, err: null })

}

async function getDexmuxer(box, urlBlob) {

    if (box === 'mp4') {

        return (await getVideoFramesMp4(urlBlob));

    } else if (box === 'webm') {

        return (await getVideoFramesWebm(urlBlob));

    } else {

        return ({ err: "Tipo de extension de archivo no compatible." });
    }
}

async function getDecoder(config, encoder, canvas, ctx, cut, waterMark, rotate, sendImage) {

    const configure = {
        ...config,
        latencyMode: "realtime",
    }
    const supported = await VideoDecoder.isConfigSupported(configure)
    if (!supported) {
        return ({ err: "Error en la configuracion del decodificador." });
    }

    const decoder = new VideoDecoder({
        async output(frame) {

            await encodeFrame(encoder, frame, canvas, ctx, cut, waterMark, rotate, sendImage);
        },
        error(e) {
            console.log(e.message);
        }
    });

    decoder.configure(configure);

    return ({ decoder, err: null })
}


async function proccessStream(mediaStreamTrackProcessor, box, width, height, bitrate, cut, waterMark, rotate) {

    return new Promise(async (resolve) => {

        try {

            const canvas = new OffscreenCanvas(width, height);

            const ctx = canvas.getContext('2d');

            var { muxer, err } = getMuxer(box, width, height);
            if (err !== null) {
                resolve({ err });
            }

            var { encoder, err } = await getEncoder(muxer, width, height, bitrate);
            if (err !== null) {
                resolve({ err });
            }

            const queuingStrategy = new CountQueuingStrategy({ highWaterMark: 1024 });

            const writableStream = new WritableStream({
                //start(controller) {},
                async write(frame, controller) {

                    await encodeFrame(encoder, frame, canvas, ctx, cut, waterMark, rotate);

                },
                async close() {

                    await encoder.flush();

                    encoder.close();

                    muxer.finalize();

                    const urlBlobOut = URL.createObjectURL(new Blob([muxer.target.buffer]));

                    resolve({ urlBlob: urlBlobOut, err: null });

                },
                abort(reason) {
                    // Lógica para manejar la cancelación del WritableStream
                    resolve({ err: reason });
                },
            }, queuingStrategy)

            mediaStreamTrackProcessor.pipeTo(writableStream)

            self.postMessage({ streamReady: true });

        } catch (error) {
            // Manejo de errores, si es necesario
            resolve({ err: error.message });
        }
    });

}


async function proccessFile(urlBlob, box, width, height, timeFrameAwait, bitrate, cut, waterMark, rotate) {

    try {

        /*
            Obtenemos el canvas para hacer modificaciones
        */
        const canvas = new OffscreenCanvas(width, height);

        const ctx = canvas.getContext('2d');

        /*
            Creamos los multiplexadores
        */
        var { muxer, err } = getMuxer(box, width, height);
        if (err !== null) {
            return ({ err });
        }

        /*
            Creamos el codificador
        */
        var { encoder, err } = await getEncoder(muxer, width, height, bitrate);
        if (err !== null) {
            return ({ err });

        }

        /*
            Creamos los desmultiplexadores
        */
        var { config, lenChunk, getVideoChunk, err } = await getDexmuxer(box, urlBlob);
        if (err !== null) {
            return ({ err });
        }


        var { decoder, err } = await getDecoder(config, encoder, canvas, ctx, cut, waterMark, rotate);
        if (err !== null) {
            return ({ err });
        }


        let proccessTime = Date.now();

        for (let chunkIndex = 0; chunkIndex < lenChunk; chunkIndex++) {

            const frame = getVideoChunk(chunkIndex);

            console.log(await decoder.decode(frame));

            await wait(timeFrameAwait);

            const proccessTimeEnd = Date.now();

            const timeproccess = proccessTimeEnd - proccessTime;
            const pendingProcess = lenChunk - chunkIndex + 1;

            self.postMessage({
                time: {
                    lenChunk,
                    proccessTime: timeproccess,
                    chunkIndex,
                    pendingProcess,
                    approximateCompletion: timeproccess * pendingProcess,
                }
            });

            proccessTime = proccessTimeEnd;

        }

        await encoder.flush();

        encoder.close();

        muxer.finalize();

        const urlBlobOut = URL.createObjectURL(new Blob([muxer.target.buffer]));

        return ({ urlBlob: urlBlobOut, err: null });

    } catch (error) {

        return ({ err: error.message })
    }

}

async function fileToFrames(urlBlob, box, width, height, timeFrameAwait, cut, waterMark, rotate) {

    try {

        const canvas = new OffscreenCanvas(width, height);

        const ctx = canvas.getContext('2d');

        var { config, lenChunk, getVideoChunk, err } = await getDexmuxer(box, urlBlob);
        if (err !== null) {
            return ({ err });
        }


        var { decoder, err } = await getDecoder(config, null, canvas, ctx, cut, waterMark, rotate, true);
        if (err !== null) {
            return ({ err });
        }

        let proccessTime = Date.now();

        for (let chunkIndex = 0; chunkIndex < lenChunk; chunkIndex++) {

            const frame = getVideoChunk(chunkIndex);

            await decoder.decode(frame);

            await wait(timeFrameAwait);

            const proccessTimeEnd = Date.now();

            const timeproccess = proccessTimeEnd - proccessTime;
            const pendingProcess = lenChunk - chunkIndex + 1;

            self.postMessage({
                time: {
                    lenChunk,
                    proccessTime: timeproccess,
                    chunkIndex,
                    pendingProcess,
                    approximateCompletion: timeproccess * pendingProcess,
                }
            });

            proccessTime = proccessTimeEnd;

        }

        return ({ endWork: true, err: null });
        
    } catch (error) {

        return ({ err: error.message })
    }

}

self.addEventListener('message', async function (event) {

    const data = event.data;

    var {
        //Stream
        mediaStreamTrackProcessor = null,
        //Video
        urlBlob = null,
        timeFrameAwait = 30,

        //Obtener imagenes
        frames = null,

        //Opciones de procesado de video
        width,
        height,
        box = "mp4", // mp4 || webm
        bitrate,

        //Opciones de edicion de video

        cut = null,
        waterMark = null,
        rotate = null,


    } = data;


    if (frames !== null) {

        var { endWork, err } = await fileToFrames(urlBlob, box, width, height, timeFrameAwait, cut, waterMark, rotate)
        if (err !== null) {
            self.postMessage({ err });
            return;
        }

        self.postMessage({ endWork });
        return;
    }

    if (urlBlob !== null) {

        var { urlBlob, err } = await proccessFile(urlBlob, box, width, height, timeFrameAwait, bitrate, cut, waterMark, rotate)
        if (err !== null) {
            self.postMessage({ err });

        } else {
            self.postMessage({ urlBlob });
            return;
        }

    }


    if (mediaStreamTrackProcessor !== null) {

        var { urlBlob, err } = await proccessStream(mediaStreamTrackProcessor, box, width, height, bitrate, cut, waterMark, rotate);
        if (err !== null) {
            self.postMessage({ err });
            return;
        }

        self.postMessage({ urlBlob });
        return;

    }


}, false);




