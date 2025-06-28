// next.config.mjs

/** @type {import('next').NextConfig} */
export default {
    experimental: {
        serverComponentsExternalPackages: ["@resvg/resvg-js"]
    },
    webpack(config, { isServer }) {
        if (isServer) {
            config.module.rules.push({
                test: /\.node$/,
                use: [{ loader: "nextjs-node-loader" }],
            });
            config.externals = [...config.externals, { "@resvg/resvg-js": "commonjs @resvg/resvg-js" }];
        }
        return config;
    },
};
