export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);

  let fileUrl = 'https://telegra.ph/' + url.pathname + url.search;

  // Telegram 文件路径处理
  if (url.pathname.length > 39) {
    const filePath = await getFilePath(env, url.pathname.split(".")[0].split("/")[2]);
    fileUrl = `https://api.telegram.org/file/bot${env.TG_Bot_Token}/${filePath}`;
  }

  const response = await fetch(fileUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
  });

  // 设置正确的 Content-Type 头
  const fileExtension = url.pathname.split('.').pop().toLowerCase();
  const mimeTypes = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  const contentType = mimeTypes[fileExtension] || 'application/octet-stream';
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Content-Type', contentType);
  newHeaders.delete('Content-Disposition');

  const modifiedResponse = new Response(response.body, {
    status: response.status,
    headers: newHeaders,
  });

  if (response.ok) {
    if (request.headers.get('Referer') === `${url.origin}/admin`) {
      return modifiedResponse;
    }

    if (env.img_url) {
      const record = await env.img_url.getWithMetadata(params.id);
      if (record && record.metadata) {
        const metadata = {
          ListType: record.metadata.ListType || "None",
          Label: record.metadata.Label || "None",
          TimeStamp: record.metadata.TimeStamp || Date.now(),
          liked: record.metadata.liked !== undefined ? record.metadata.liked : false
        };

        if (metadata.ListType === "White") {
          return modifiedResponse;
        } else if (metadata.ListType === "Block" || metadata.Label === "adult") {
          // 修复点：正确处理字符串模板语法
          const referer = request.headers.get('Referer');
          const redirectUrl = referer 
            ? "https://static-res.pages.dev/teleimage/img-block-compressed.png" 
            : `${url.origin}/block-img.html`;
          return Response.redirect(redirectUrl, 302);
        }

        if (env.WhiteList_Mode === "true") {
          return Response.redirect(`${url.origin}/whitelist-on.html`, 302);
        }
      } else {
        await env.img_url.put(params.id, "", {
          metadata: { ListType: "None", Label: "None", TimeStamp: Date.now(), liked: false },
        });
      }
    }

    // 内容审查逻辑
    const time = Date.now();
    if (env.ModerateContentApiKey) {
      const moderateResponse = await fetch(`https://api.moderatecontent.com/moderate/?key=${env.ModerateContentApiKey}&url=https://telegra.ph${url.pathname}${url.search}`);
      const moderateData = await moderateResponse.json();

      if (env.img_url) {
        await env.img_url.put(params.id, "", {
          metadata: { ListType: "None", Label: moderateData.rating_label, TimeStamp: time, liked: false },
        });
      }

      if (moderateData.rating_label === "adult") {
        return Response.redirect(`${url.origin}/block-img.html`, 302);
      }
    } else if (env.img_url) {
      await env.img_url.put(params.id, "", {
        metadata: { ListType: "None", Label: "None", TimeStamp: time, liked: false },
      });
    }
  }

  return modifiedResponse;
}

async function getFilePath(env, file_id) {
  try {
    const url = `https://api.telegram.org/bot${env.TG_Bot_Token}/getFile?file_id=${file_id}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const { result } = await res.json();
    return result.file_path;
  } catch (error) {
    return null;
  }
}
