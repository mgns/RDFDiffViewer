package controllers;

import java.io.File;
import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import models.Triple;
import play.Logger;
import play.Play;
import play.mvc.Controller;
import play.mvc.Result;
import views.html.index;
import views.html.title;

public class Application extends Controller {
	
	public static Result title() {
		return ok(title.render());
	}

	/**
	 * Generates the standard entity view
	 * @param entity	the DBpedia entity to display
	 * @return			the desired page or 404 if the entity is unknown to DBpedia
	 * @throws UnsupportedEncodingException 
	 */
    public static Result site(String entity) throws UnsupportedEncodingException {
        Logger.info("Entity: " + entity);

        String encodedEntity = encodeEntity(entity);

        List<String> versions = Triple.getVersionsForEntity(encodedEntity);
        List<String> allVersions =  Triple.getAllVersions();
    	if(versions.isEmpty()) {
    		return notFound("The entity " + entity + " does not exist in any version of DBpedia.");
    	}
        return ok(index.render(encodedEntity, versions, allVersions));
    }

    public static Result plain(String entity, String version) throws IOException {
        Logger.info("Entity: " + entity + " Version: " + version);

        String encodedEntity = encodeEntity(entity);

        File dataFolder = new File(Play.application().configuration().getString("dataFolder"));
        Path versionPath = Paths.get(dataFolder.getAbsolutePath(), version);

        String filePath = Triple.getFilePathForVersionPath(versionPath.toString(), entity);

        return ok(new File(filePath));
    }


    public static String encodeEntity(String entity) throws UnsupportedEncodingException {
    	return URLEncoder.encode(entity, "UTF-8");
    }
    
    public static String decodeEntity(String entity) throws UnsupportedEncodingException {
    	return URLDecoder.decode(entity, "UTF-8");
    }

}
