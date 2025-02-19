const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

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
            inject: true, // Ensure script is injected
        }),
    ],
    mode: "development",
};