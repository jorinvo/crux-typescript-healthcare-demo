FROM clojure:openjdk-11-tools-deps

WORKDIR /usr/lib/crux
EXPOSE 3000

ADD deps.edn deps.edn
RUN clojure -Sforce -Spath >/dev/null

ADD crux.edn crux.edn

CMD ["clojure", "-m", "crux.main"]
