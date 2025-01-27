'use strict';


globalThis["tiuviVideoEditor"]['newCanvas'] = async function (args) {

    const {
        width, height, newWidth, newHeight, cutScreen, waterMark, rotate,
    } = args;

    const canvas = new OffscreenCanvas(newWidth, newHeight);

    const ctx = canvas.getContext('2d');

    return ({
        canvasBase: canvas,
        ctx: ctx,
        canvasRender: canvas,
    });

}

globalThis["tiuviVideoEditor"]['editVideo'] = async function (args) {

    const {
        width , height,
        canvas, frame, secondFrame, editSecondary, cutScreen, waterMark, rotate, autoRotate, getTimeFrame
    } = args;


    const {
        canvasBase,
        ctx,
    } = canvas;

    const { timeStampReal } = frame

    ctx.save();

    if (rotate !== null) {

        ctx.rotate(rotate);
    }

    if (rotate === null && autoRotate !== null) {
        ctx.rotate(autoRotate);
    }

    if (cutScreen !== null) {

        if(rotate === null && autoRotate !== null){
           
            // w 720  h 1280 640
            // scale 0, 0, 1280,  720, -640 , 0, 640, 360
            ctx.drawImage(frame, 
                cutScreen.startWidth, cutScreen.startHeight,
                cutScreen.sizeHeight, cutScreen.sizeWidth, 
                -cutScreen.screenSizeHeight,0,
                cutScreen.screenSizeHeight, cutScreen.screenSizeWidth
            );

        }else{

            ctx.drawImage(frame,
                //Primeras coordenadas se obtienen del lienzo original
                cutScreen.startWidth, cutScreen.startHeight,
                cutScreen.sizeWidth, cutScreen.sizeHeight,
                //Las Segundas cordenadas son para el final
                cutScreen.screenStartWidth, cutScreen.screenStartHeight,
                cutScreen.screenSizeWidth, cutScreen.screenSizeHeight
            );
        }
     

    } else {
     
        if(rotate === null && autoRotate !== null){
       
            // w 720  h 1280 
            // normal - 0, 0, 1280,  1280, -1280,0, 1280, 1280
            ctx.drawImage(frame, 0, 0, height,  width, -height , 0, height, width);
        }else{
            ctx.drawImage(frame, 0, 0);
        }
    }

    if (waterMark !== null) {

        for (const data of waterMark) {

            if (timeStampReal >= (data.initMs * 1000) && timeStampReal <= (data.endMs * 1000)) {

                ctx.drawImage(data.image,
                    //Primeras coordenadas se obtienen del lienzo original
                    data.startWidth, data.startHeight, data.sizeWidth, data.sizeHeight,
                    //Las Segundas cordenadas son para el final
                    data.screenStartWidth, data.screenStartHeight, data.screenSizeWidth, data.screenSizeHeight);

            }

        }
    }


    if (secondFrame) {

        let proportion = 1;

        if (frame.displayWidth > frame.displayHeight) {

            if ((frame.displayWidth / 4) < secondFrame.displayWidth) {
                proportion = (frame.displayWidth / 4) / secondFrame.displayWidth
            }
        } else {
            if ((frame.displayHeight / 4) < secondFrame.displayHeight) {
                proportion = (frame.displayHeight / 4) / secondFrame.displayHeight
            }
        }

        ctx.drawImage(secondFrame,
            //Primeras coordenadas se obtienen del lienzo original
            0, 0,
            secondFrame.displayWidth, secondFrame.displayHeight,
            //Las Segundas cordenadas son para el final
            0, 0,
            secondFrame.displayWidth * proportion, secondFrame.displayHeight * proportion
        );
    }

    ctx.restore();

    
}

