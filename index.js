const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const xml2js = require("xml2js");
const { init: initDB, Counter } = require("./db");

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);

// 使用 body-parser 解析 XML 请求体
app.use(bodyParser.raw({ type: "application/xml" }));
// 使用 helmet 设置 CSP 头
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'none'"],
      connectSrc: ["'self'", "http://localhost:3000"], // 允许连接到 localhost:3000
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  })
);

app.post("/api/msg/receive", async (req, res) => {
  console.log("Received raw body:", req.body); // 打印请求体内容

  const rawBody = req.body.toString();
  console.log("Received raw body:", rawBody); // 打印请求体内容

  const parser = new xml2js.Parser();
  parser.parseString(rawBody, (err, result) => {
    if (err) {
      console.error("Error parsing XML:", err);
      res.status(400).send("Invalid XML format");
      return;
    }

    // 从result中提取需要的数据
    const { FromUserName, ToUserName, CreateTime, MsgType, Event, EventKey } =
      result.xml;

    // 根据Event类型处理不同的事件
    if (Event === "CLICK") {
      console.log("EventKey:", EventKey);
    } else if (Event === "VIEW") {
      // 处理点击菜单跳转链接的事件
    }
    // 发送响应
    const responseXML = `
      <xml>
        <ToUserName><![CDATA[${FromUserName}]]></ToUserName>
        <FromUserName><![CDATA[${ToUserName}]]></FromUserName>
        <CreateTime>${CreateTime}</CreateTime>
        <MsgType><![CDATA[text]]></MsgType>
        <Content><![CDATA[Hello!]]></Content>
      </xml>
    `;
    res.type("xml").send(responseXML);
  });
});

const port = process.env.PORT || 80;

async function bootstrap() {
  await initDB();
  app.listen(port, () => {
    console.log("启动成功", port);
  });
}

bootstrap();
