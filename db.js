const { Sequelize, DataTypes } = require("sequelize");

// 从环境变量中读取数据库配置
// const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS = "" } = process.env;
const { MYSQL_USERNAME, MYSQL_PASSWORD, MYSQL_ADDRESS } = {
  MYSQL_USERNAME: "root",
  MYSQL_PASSWORD: "FDJja3gb",
  MYSQL_ADDRESS: "sh-cynosdbmysql-grp-9bruudi2.sql.tencentcdb.com:28051",
};

const [host, port] = MYSQL_ADDRESS.split(":");

const sequelize = new Sequelize("wx_apex_bot", MYSQL_USERNAME, MYSQL_PASSWORD, {
  host,
  port,
  dialect: "mysql",
  // 添加连接池配置
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  // 添加重试连接配置
  retry: {
    max: 3,
  },
});

// 用户模型
const User = sequelize.define(
  "User",
  {
    wxid: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      index: true,
      comment: "微信ID",
    },
    originid: {
      type: DataTypes.STRING,
      allowNull: false,
      index: true,
      comment: "原始ID",
    },
  },
  {
    timestamps: false,
  }
);

// 匹配历史模型
const MatchHistory = sequelize.define(
  "MatchHistory",
  {
    matchTime: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "匹配时间", // 注释
    },
    matchRes: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "匹配结果", // 注释
    },
    rank_beforeMatch: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "匹配前排名", // 注释
    },
    rank_afterMatch: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "匹配后排名", // 注释
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
      index: true, // 索引
      comment: "用户ID", // 注释
    },
  },
  {
    timestamps: false, // 关闭自动添加时间戳字段
  }
);

// 追踪会话模型
const TrackSession = sequelize.define(
  "TrackSession",
  {
    wxid: {
      type: DataTypes.STRING,
      allowNull: false,
      index: true,
      comment: "微信ID",
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "开始时间",
    },
    lastCheckTime: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "最后检查时间",
    },
    lastScore: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "上次分数",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: "是否活跃",
    },
  },
  {
    timestamps: false,
  }
);

// 追踪记录模型
const TrackRecord = sequelize.define(
  "TrackRecord",
  {
    sessionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: TrackSession,
        key: "id",
      },
      comment: "追踪会话ID",
    },
    recordTime: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: "记录时间",
    },
    score: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "当前分数",
    },
    scoreDiff: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: "分数变��",
    },
  },
  {
    timestamps: false,
  }
);

async function init() {
  await sequelize.sync({ alter: true });
}

module.exports = {
  init,
  User,
  MatchHistory,
  TrackSession,
  TrackRecord,
};
