FROM oracle/graalvm-ce:20.0.0

# Install Clojure
RUN curl -s https://download.clojure.org/install/linux-install-1.10.1.536.sh | bash

WORKDIR /usr/lib/crux
EXPOSE 3000

ADD deps.edn deps.edn
RUN clojure -Sforce -Spath >/dev/null

ADD crux.edn crux.edn

CMD ["clojure", "-m", "crux.main"]
