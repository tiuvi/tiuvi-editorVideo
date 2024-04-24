# tiuvi-editorVideo
First web video editor, using web codecs and ffmpeg wasm. This video editor does not use server only client resources. It is very fast compared to ffmpeg wasm for coding tasks.

Demuxer mp4
https://github.com/gpac/mp4box.js

Demuxer webm
https://github.com/jscodec/jswebm

Corte de videos
https://github.com/ffmpegwasm

Multiplexor mp4
https://github.com/Vanilagy/mp4-muxer

Multiplexor webm
https://github.com/Vanilagy/webm-muxer

These files are given separately and are not a direct compilation of your libraries

Change the scripts imported in the worker, by the location in your directories.
importScripts(
    //desmultiplexacion
    'https://cell1.tiuvi.com:1030/mp4box.js',
    'https://cell1.tiuvi.com:1030/webmDemuxer.js',

    //Multiplexacion
    'https://cell1.tiuvi.com:1030/mp4-multiplexer.js',
    'https://cell1.tiuvi.com:1030/webm-multiplexer.js',
);


