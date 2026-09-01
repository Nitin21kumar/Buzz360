
FROM nginx:1.27-alpine

ENV NGINX_ENVSUBST_TEMPLATE_SUFFIX=.template
ENV BACKEND_URL=http://backend:8000
ENV WHATSAPP_URL=http://whatsapp-service:4000
ENV PORT=80

COPY nginx.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
