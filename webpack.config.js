const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
    entry: path.resolve(__dirname, "src/app.ts"),
    output: {
        filename: "js/bundle.js",
        path: path.resolve(__dirname, "dist"),
        clean: true,
    },
    resolve: {
        extensions: [".ts", ".js"],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: "ts-loader",
                exclude: /node_modules/,
            },
        ],
    },
    devServer: {
        host: "0.0.0.0",
        port: 8080,
        static: path.resolve(__dirname, "public"),
        hot: true,
        devMiddleware: {
            publicPath: "/",
        }
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: path.resolve(__dirname, "public/index.html"),
            inject: true,
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: path.resolve(__dirname, "public"), // Copy public assets
                    to: path.resolve(__dirname, "dist"),
                    globOptions: { ignore: ["**/index.html"] }, // Avoid duplicate HTML file
                },
                {
                    from: path.resolve(__dirname, "dist"), // Copy built files from dist
                    to: "/Users/web/ai/board/threejs-game-racing/xforce/public",
                }
            ],
        }),
    ],
    mode: "development",
};
