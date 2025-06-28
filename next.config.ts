// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config, options) {
    const { isServer, nextRuntime } = options;

    if (isServer && nextRuntime === "nodejs") {
      config.module.rules.push({
        test: /\.node$/,
        use: [{ loader: "nextjs-node-loader" }],
      });

      config.externals = config.externals || [];
      config.externals.push({
        "@resvg/resvg-js-linux-x64-gnu":
          "commonjs @resvg/resvg-js-linux-x64-gnu",
        "@resvg/resvg-js-linux-x64-musl":
          "commonjs @resvg/resvg-js-linux-x64-musl",
      });
    }

    return config;
  },
};

export default nextConfig;
