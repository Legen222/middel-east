# Server-sent events: no buffering, long-lived connections.
proxy_http_version 1.1;
proxy_set_header Connection "";
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header CF-IPCountry $country;
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 1h;
