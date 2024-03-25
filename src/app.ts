import express, { Request, Response } from "express";
import { createServer } from "node:http";
import {
  createBot,
  createFlow,
  MemoryDB,
  createProvider,
  addKeyword,
} from "@bot-whatsapp/bot";
import { BaileysProvider, handleCtx } from "@bot-whatsapp/provider-baileys";
import { exec } from "child_process";
import * as fs from "fs";
import { Server } from "socket.io";
import path from "path";
import cors from "cors";

/**
 * @description
 *      Implementamos la librería para crear el chat bot. En este caso, el usuario tiene que
 *      mandar mensajes a traves de la web. Con socket mandamos la disponibilidad del WPW,
 *      si está conectado, envía un mensaje, caso contrario, envía el QR para escanear.
 *
 */
const main = async () => {
  /** Usamos express para crear el servidor */
  const app = express();
  const server = createServer(app);
  /** Inicializamos socket.io */
  const io = new Server(server, {
    cors: {
      origin: "http://localhost:4200",
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Authorization"],
    },
  });
  /** Le damos un puerto por default */
  const port = 3002;

  /** Aquí comenzamos a usar la librería de bot-whatsapp */
  const provider = createProvider(BaileysProvider);

  /** Middleware para analizar el cuerpo de la solicitud como JSON */
  app.use(express.json());
  /** Habilitamos los cors para las conexiones */
  app.use(
    cors({
      origin: "http://localhost:4200", // O el origen específico del cliente
      methods: ["GET", "POST"], // Métodos permitidos
      allowedHeaders: ["Content-Type", "Authorization"], // Cabeceras permitidas
    })
  );

  /** Creamos el bot, podemos mandar mensajes de bienvenida predefinidos, por ejemplo:
   *    - const welcome = addKeyword("Hola").addAnswer("Buenas!");
   *  donde la keyword "Hola", va a dar respuesta al usuario "Buenas!"
   */
  await createBot({
    flow: createFlow([]),
    database: new MemoryDB(),
    provider,
  });

  let isConnected = false

  /** @description Escuchamos los eventos de la librería, donde "ready" es que ya existe un dispositivo vinculado. */
  provider.on("ready", () => {
    isConnected = true
    io.emit("connection", "connected");
    console.log("Conectado");
  });

  /** @description Escuchamos los eventos de la librería, donde "require_action" es que no existe un dispositivo vinculado. */
  provider.on("require_action", () => {
    isConnected = false
    const filePath = path.join(__dirname, "../bot.qr.png");
    const imageBinary = fs.readFileSync(filePath);
    const base64Image = Buffer.from(imageBinary).toString("base64");
    io.emit("connection", `data:image/png;base64,${base64Image}`);
    console.log("Esperando conexión");
  });

  /** @description Endpoint para mandar la info del número de teléfono y el mensaje a enviar. */
  app.post("/send-message", async (req: Request, res: Response) => {
    const { phone, message } = req.body;
    await provider.sendMessage(phone, message, {});
    res.send("OK");
  });

  /** @description Endpoint para recibir el estado del dispositivo conectado */
  app.get("/connection", (req: Request, res: Response) => {
    if (isConnected) res.send({connected: true, mediaUrl: ''})
    else {
        const filePath = path.join(__dirname, "../bot.qr.png");
        const imageBinary = fs.readFileSync(filePath);
        const base64Image = Buffer.from(imageBinary).toString("base64");
        res.send({connected: false, mediaUrl: `data:image/png;base64,${base64Image}`})
    }
  })

  /** La conexión del usuario al server */
  io.on("connection", (socket) => {
    console.log("a user connected");

    /** Socket desconectado del usuario */
    socket.on("disconnect", () => {
      console.log("user disconnected");
    });
  });

  server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}!`);
  });
};

main();
