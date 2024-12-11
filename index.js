const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const axios = require("axios");
const { init: initDB, User, TrackSession, TrackRecord } = require("./db");

const logger = morgan("tiny");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cors());
app.use(logger);

async function getUserInfo(wxid) {
  try {
    const user = await User.findOne({
      where: { wxid },
    });
    return user;
  } catch (error) {
    console.error("获取用户信息失败:", error);
    return null;
  }
}

async function getPlayerData(originId) {
  try {
    const response = await axios.get(
      `https://api.mozambiquehe.re/bridge?auth=f99669761be1ebea4901718c90c44064&player=${originId}&platform=PC`
    );
    if (response.data?.global) {
      return response.data;
    }
    return null;
  } catch (error) {
    console.error("获取游戏数据失败:", error);
    return null;
  }
}

app.post("/api/msg/receive", async (req, res) => {
  const rawBody = req.body;
  console.log("Received raw body:", rawBody);

  const { ToUserName, FromUserName, CreateTime, MsgType, Content } = rawBody;

  // 检查消息类型
  if (MsgType !== "text") {
    return res.send({
      ToUserName: FromUserName,
      FromUserName: ToUserName,
      CreateTime: CreateTime,
      MsgType: "text",
      Content: "仅支持文本消息，发送'帮助'查看支持的命令",
    });
  }

  let responseContent = "";
  const command = Content.trim().split(/\s+/)[0]; // 分离命令和参数

  try {
    switch (command) {
      case "帮助":
        responseContent = `📋 支持的命令：
1️⃣ 绑定 <游戏ID> - 绑定游戏账号
2️⃣ 查询 [游戏ID] - 查询玩家信息
3️⃣ 底分 - 查询当前段位底分
4️⃣ 追踪 - 开始追踪排位分数变化
5️⃣ 停止追踪 - 停止追踪并生成报告
6️⃣ 追踪查询 - 查看最近一次追踪记录
`;
        break;

      case "绑定":
        const originId = Content.replace("绑定", "").trim();
        if (!originId) {
          responseContent = "❌ 请输入要绑定的游戏ID\n📝 例如：绑定 PlayerName";
          break;
        }

        try {
          // 验证游戏ID
          const playerData = await getPlayerData(originId);
          if (!playerData) {
            responseContent = "❌ ��找到家，请检查ID是否正确";
            break;
          }

          // 查找用户
          const user = await getUserInfo(FromUserName);
          if (user) {
            if (user.originid === originId) {
              responseContent = "ℹ️ 您已绑定该账号，无需重复绑定";
            } else {
              await user.update({ originid: originId });
              responseContent = `✅ 更新绑定成功！\n🎮 游戏ID：${playerData.global.name}`;
            }
          } else {
            await User.create({
              wxid: FromUserName,
              originid: originId,
            });
            responseContent = `🎮 首次绑定成功！\n🎮 游戏ID：${playerData.global.name}`;
          }
        } catch (error) {
          console.error("绑定失败:", error);
          responseContent =
            error.name === "SequelizeUniqueConstraintError"
              ? "⚠️ 该游戏ID已被其他用户绑定"
              : "⚠️ 服务器处理失败，请稍后重试";
        }
        break;

      case "查询":
        try {
          let queryOriginId;
          const searchId = Content.replace("查询", "").trim();

          if (searchId) {
            queryOriginId = searchId;
          } else {
            const user = await getUserInfo(FromUserName);
            if (!user) {
              responseContent =
                "❌ 您还未绑定账号\n📝 请先使用'绑定 游戏ID'进行绑定";
              break;
            }
            queryOriginId = user.originid;
          }

          const playerData = await getPlayerData(queryOriginId);
          if (!playerData) {
            responseContent = "获取玩家信息失败，请稍后重试";
            break;
          }

          const { global } = playerData;
          responseContent = `🎮 玩家名称：${global.name}
📊 排位信息：
  💯 分数：${global.rank.rankScore.toLocaleString()}
  🏆 段位：${global.rank.rankName} ${global.rank.rankDiv}
  🔢 排名：${
    global.rank.ladderPosPlatform > 0
      ? `${global.rank.ladderPosPlatform}`
      : `${global.rank.ALStopInt} `
  }
⭐ 等级：${global.level} (${global.levelPrestige || 0}转)`;
        } catch (error) {
          console.error("查询失败:", error);
          responseContent = "查询失败，请稍后重试";
        }
        break;

      case "底分":
        try {
          console.log("开始查询底分");
          const predatorInfo = await axios.get(
            "https://api.mozambiquehe.re/predator?auth=f99669761be1ebea4901718c90c44064"
          );
          console.log("取到猎杀数据:", predatorInfo.data);

          const { RP } = predatorInfo.data;
          const pcData = RP.PC;

          // 基础信息
          responseContent = `🖥️ [PC端]段位底分信息：
👑 猎杀底分：${pcData.val.toLocaleString()}分
👥 大师/猎杀总人数：${pcData.totalMastersAndPreds.toLocaleString()}
⏰ 更新时间：${new Date(pcData.updateTimestamp * 1000).toLocaleString("zh-CN", {
            hour12: false,
          })}`;

          console.log("基础信息设置完成");

          // 获取个人信息
          const user = await getUserInfo(FromUserName);
          console.log("获取到用户信息:", user);

          if (user) {
            const playerData = await getPlayerData(user.originid);
            console.log("获取到玩家数据:", playerData?.global);

            if (playerData?.global) {
              const currentScore = playerData.global.rank.rankScore;
              const diffToMaster = 15000 - currentScore;
              const diffToPred = pcData.val - currentScore;

              responseContent += `\n\n📈 您的段位情况：
🎮 当前分数：${currentScore.toLocaleString()}分
${
  currentScore < 15000
    ? `📊 距离大师：${diffToMaster.toLocaleString()}分`
    : currentScore < pcData.val
    ? `📊 距离猎杀：${diffToPred.toLocaleString()}分`
    : `🏆 当前猎杀排名：#${playerData.global.rank.ladderPosPlatform}`
}`;
            }
          } else {
            responseContent += "\n\n💡 绑定账号后可查看个人段位差距";
          }

          console.log("最终响应内容:", responseContent);
        } catch (error) {
          console.error("底分查询失败:", error);
          responseContent = "⚠️ 底分查询失败，请稍后重试";
        }
        break;

      case "追踪":
        try {
          const user = await getUserInfo(FromUserName);
          if (!user) {
            responseContent =
              "❌ 您还未绑定账号\n📝 请先使用'绑定 游戏ID'进行绑定";
            break;
          }
          responseContent = await startTracking(FromUserName, user.originid);
        } catch (error) {
          console.error("追踪失败:", error);
          responseContent = "⚠️ 追踪失败，请稍后重试";
        }
        break;

      case "停止追踪":
        try {
          responseContent = await stopTracking(FromUserName, "手动暂停");
        } catch (error) {
          console.error("停止追踪失败:", error);
          responseContent = "⚠️ 停止追踪失败，请稍后重试";
        }
        break;

      case "追踪查询":
        try {
          // 获取最近的追踪会话
          const lastSession = await TrackSession.findOne({
            where: { wxid: FromUserName },
            order: [["startTime", "DESC"]],
          });

          if (!lastSession) {
            responseContent = "❌ 未找到任何追踪记录";
            break;
          }

          // 获取该会话的所有记录
          const records = await TrackRecord.findAll({
            where: { sessionId: lastSession.id },
            order: [["recordTime", "ASC"]],
          });

          // 生成报告
          let totalGames = records.length;
          let totalPoints = records.reduce(
            (sum, record) => sum + record.scoreDiff,
            0
          );
          let startScore = lastSession.lastScore - totalPoints;

          responseContent = `📊 最近追踪记录
⏰ 时间：${new Date(lastSession.startTime).toLocaleString()} - ${new Date(
            lastSession.lastCheckTime
          ).toLocaleString()}
📈 总场次：${totalGames}
💯 总积分：${totalPoints > 0 ? "+" : ""}${totalPoints}
📊 分数变化：${startScore} → ${lastSession.lastScore}
🔄 状态：${lastSession.isActive ? "追踪中" : "已结束"}

📝 详细记录：`;

          records.forEach((record, index) => {
            responseContent += `\n${index + 1}. ${new Date(
              record.recordTime
            ).toLocaleString()}
     ${record.scoreDiff > 0 ? "+" : ""}${record.scoreDiff}分 (${record.score})`;
          });
        } catch (error) {
          console.error("追踪查询失败:", error);
          responseContent = "⚠️ 追踪查询失败，请稍后重试";
        }
        break;

      default:
        responseContent = "未知命令，发送'帮助'查看支持的命令";
    }
  } catch (error) {
    console.error("处理消息失败:", error);
    responseContent = "⚠️ 服务器处理失败，请稍后重试";
  }

  return res.send({
    ToUserName: FromUserName,
    FromUserName: ToUserName,
    CreateTime: CreateTime,
    MsgType: "text",
    Content: responseContent,
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
// matches: [
//   {
//     matchTime: "2023-07-01 19:00:00", //比赛时间
//     matchRes: -100, //比赛结果 加/减分数
//     rank_beforeMatch: "Diamand", //比赛前的段位
//     rank_afterMatch: "Platinum", //比赛后的段位
//   },
//   {
//     matchTime: "2023-07-01 19:00:00", //比赛时间
//     matchRes: -100, //比赛结果 加/减分数
//     rank_beforeMatch: "Diamand", //比赛前的段位
//     rank_afterMatch: "Platinum", //比赛后的段位
//   },
// ];

/*
希望查询信息文案：

Player：global.name//世界第一公主殿下
排位信息：
  分数：global.rank.rankScore
  段位：global.rank.rankName+global.rank.rankDiv
  排名：global.rank.ALStopInt（当前平）
生涯息：

*/

// 追踪会话存储
const trackingSessions = new Map();

// 追踪检查函数
async function checkPlayerScore(sessionId, wxid, originId) {
  try {
    console.log(`检查玩家分数 - sessionId: ${sessionId}, wxid: ${wxid}`);

    const session = await TrackSession.findByPk(sessionId);
    if (!session) {
      console.log(`未找到会话 ${sessionId}`);
      clearInterval(trackingSessions.get(wxid));
      trackingSessions.delete(wxid);
      return;
    }

    if (!session.isActive) {
      console.log(`会话 ${sessionId} 已不活跃`);
      clearInterval(trackingSessions.get(wxid));
      trackingSessions.delete(wxid);
      return;
    }

    const playerData = await getPlayerData(originId);
    if (!playerData?.global) {
      console.log(`无法获取玩家数据 ${originId}`);
      return;
    }

    // 检查玩家是否���线
    if (!playerData.realtime.isOnline) {
      console.log(`玩家已离线 ${originId}`);
      await stopTracking(wxid, "玩家已离线");
      return;
    }

    const currentScore = playerData.global.rank.rankScore;
    const scoreDiff = currentScore - session.lastScore;

    console.log(`当前分数: ${currentScore}, 差值: ${scoreDiff}`);

    // 如果分数有化，记录数据
    if (scoreDiff !== 0) {
      await TrackRecord.create({
        sessionId: sessionId,
        recordTime: new Date(),
        score: currentScore,
        scoreDiff: scoreDiff,
      });

      // 更新会话的最后分数和检查时间
      await session.update({
        lastScore: currentScore,
        lastCheckTime: new Date(),
      });
    } else {
      // 即使分数没变化，也更新最后检查时间
      await session.update({
        lastCheckTime: new Date(),
      });
    }

    // 检查是否超过5小时
    const now = new Date();
    const duration = now - session.startTime;
    if (duration > 5 * 60 * 60 * 1000) {
      console.log(`会话 ${sessionId} 已超过5小时`);
      await stopTracking(wxid, "追踪时间已达5小时");
    }
  } catch (error) {
    console.error("追踪检查失败:", error);
    // 发生错误时不要停止追踪，继续尝试
  }
}

// 开始追踪
async function startTracking(wxid, originId) {
  try {
    // 先检查是否有未正常关闭的活跃会话
    const existingSession = await TrackSession.findOne({
      where: { wxid, isActive: true },
    });

    if (existingSession) {
      // 关闭旧会话
      await existingSession.update({ isActive: false });
      clearInterval(trackingSessions.get(wxid));
      trackingSessions.delete(wxid);
    }

    // 删除该用户之前的所有追踪数据
    const oldSessions = await TrackSession.findAll({
      where: { wxid },
    });

    // 删除旧会话相关的所有记录
    for (const session of oldSessions) {
      await TrackRecord.destroy({
        where: { sessionId: session.id },
      });
    }

    // 删除旧会话
    await TrackSession.destroy({
      where: { wxid },
    });

    // 检查是否已经在追踪
    if (trackingSessions.has(wxid)) {
      return "⚠️ 您已经在追踪中，请先停止当前追踪";
    }

    // 获取初始分数
    const playerData = await getPlayerData(originId);
    if (!playerData?.global) {
      return "❌ 无法获取玩家数据，请稍后重试";
    }

    // 创建追踪会话
    const session = await TrackSession.create({
      wxid: wxid,
      startTime: new Date(),
      lastCheckTime: new Date(),
      lastScore: playerData.global.rank.rankScore,
      isActive: true,
    });

    console.log(`创建新会话 - ID: ${session.id}, wxid: ${wxid}`);

    // 启动定时检查
    const intervalId = setInterval(() => {
      checkPlayerScore(session.id, wxid, originId);
    }, 60000); // 每分钟检查一次

    trackingSessions.set(wxid, intervalId);
    return `✅ 开始追踪排位分数变化
⏰ 追踪规则：
1. 每分钟自动检查一次分数变化
2. 5小时后自动停止追踪
3. 检测到玩家离线时自动停止
4. 发送"停止追踪"可随时结束

📝 结束追踪后将生成完整报告
ℹ️ 可随时发送"追踪查询"查看记录`;
  } catch (error) {
    console.error("开始追踪失败:", error);
    return "⚠️ 开始追踪失败，请稍后重试";
  }
}

// 停止追踪并生成报告
async function stopTracking(wxid, reason = "") {
  try {
    // 停止定时器
    clearInterval(trackingSessions.get(wxid));
    trackingSessions.delete(wxid);

    // 获取最后活跃的会话
    const session = await TrackSession.findOne({
      where: { wxid, isActive: true },
      order: [["startTime", "DESC"]],
    });

    if (!session) {
      return "❌ 没有找到活跃的追踪会话";
    }

    // 停止会话
    await session.update({ isActive: false });

    // 获取所有记录
    const records = await TrackRecord.findAll({
      where: { sessionId: session.id },
      order: [["recordTime", "ASC"]],
    });

    // 生成报告
    let totalGames = records.length;
    let totalPoints = records.reduce(
      (sum, record) => sum + record.scoreDiff,
      0
    );
    let startScore = session.lastScore - totalPoints;

    let report = `📊 追踪报告 (${new Date(
      session.startTime
    ).toLocaleString()} - ${new Date().toLocaleString()})${
      reason ? `\n📌 停止原因：${reason}` : ""
    }
🎮 总次数：${totalGames}
📈 总积分：${totalPoints > 0 ? "+" : ""}${totalPoints}
💯 分数变化：${startScore} → ${session.lastScore}

📝 详细记录：`;

    records.forEach((record, index) => {
      report += `\n${index + 1}. ${new Date(record.recordTime).toLocaleString()}
   ${record.scoreDiff > 0 ? "+" : ""}${record.scoreDiff}分 (${record.score})`;
    });

    return report;
  } catch (error) {
    console.error("停止追踪失败:", error);
    return "⚠️ 停止追踪失败，请稍后重试";
  }
}
